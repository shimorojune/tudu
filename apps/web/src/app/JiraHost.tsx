import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  addDays,
  JIRA_ASSIGNED_VIEW,
  linksByKey,
  syncedWords,
  whenWords,
  type IsoDate,
  type JiraIssue,
  type JiraLink,
  type SpaceSummary,
} from '@tudu/core';
import { jiraError, type JiraListAsk } from '@tudu/client';
import {
  AppsPanel,
  Drawer,
  JiraPanel,
  showToast,
  type JiraConnectError,
  type JiraPanelIssue,
  type JiraPanelLink,
  type JiraPanelState,
  type JiraPreviewIssue,
  type JiraView as PanelView,
} from '@tudu/ui';
import { useEffect, useState } from 'react';
import { askBacklogView, flashTask, locateTask, showDay, useShownDay } from './dayView';
import {
  closeApps,
  hostOf,
  jiraClient,
  jiraParam,
  JIRA_STALE_MS,
  markJiraFresh,
  openApps,
  openInJira,
  setFromApps,
  setJiraPick,
  useAppsOpen,
  useFromApps,
  useJira,
  useJiraPick,
  withJira,
  type JiraPick,
} from './jira';
import { initialsOf, queryClient } from './session';
import { spacePath } from './space';
import { taskStore, useOnline } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';

/** The spinner on an issue's calendar button shows at least this long, so adding reads as a step. */
const ADD_BEAT_MS = 450;

const toPanelLink = (l: JiraLink): JiraPanelLink => ({
  taskId: l.taskId,
  id: l.ref,
  title: l.title,
  day: l.day,
  done: l.done,
});

/** An issue as the panel's row, with the tasks of yours linked to it. */
export function toPanelIssue(i: JiraIssue, links: Map<string, JiraLink[]>): JiraPanelIssue {
  return {
    key: i.key,
    summary: i.summary,
    status: i.status || undefined,
    due: i.due,
    linked: (links.get(i.key) ?? []).map(toPanelLink),
  };
}

/** Which list a pick reads. */
export function askOf(pick: JiraPick, views: Array<{ id: string }>): JiraListAsk {
  if (pick.view === 'custom' && pick.jql) return { jql: pick.jql };
  if (pick.view !== JIRA_ASSIGNED_VIEW && views.some((v) => v.id === pick.view)) return { view: pick.view };
  return { view: JIRA_ASSIGNED_VIEW };
}

/**
 * What the panel is doing, from what the reads say: no connection asks for one; a token that stopped working,
 * Jira out of reach and being offline keep the last issues under their banner.
 */
export function panelState(a: {
  connected: boolean;
  reconnecting: boolean;
  expired: boolean;
  online: boolean;
  hasData: boolean;
  pending: boolean;
  errorCode: string | null;
}): JiraPanelState {
  if (!a.connected) return 'connect';
  if (a.reconnecting) return 'reconnect';
  if (a.expired || a.errorCode === 'expired') return 'expired';
  if (!a.online && (a.hasData || a.errorCode)) return 'offline';
  if (a.errorCode) return 'error';
  if (a.pending) return 'loading';
  return 'ready';
}

/**
 * The Jira panel's insides, the same on every size: the connect form, the views and search, the list, the preview
 * and adding to a day. `compact` is the phone's page; the desk and tablets hold it in a side panel.
 */
export function JiraView({
  space,
  issue,
  onIssue,
  onClose,
  compact,
}: {
  space: SpaceSummary;
  issue: string | null;
  onIssue: (key: string | null) => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const vp = useViewport();
  const { today } = useWorkingDay();
  const shownDay = useShownDay() ?? today;
  const online = useOnline();
  const fromApps = useFromApps();
  const { conn, known, links } = useJira(space.id);
  const pick = useJiraPick(space.id);
  const [reconnecting, setReconnecting] = useState(false);
  // A fresh connect keeps the form up for its Connected tick, then the list.
  const [holding, setHolding] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const views = conn?.views ?? [];
  const ask = askOf(pick, views);
  const list = useQuery({
    ...jiraClient.issuesQuery(space.id, ask),
    enabled: !!conn && conn.state === 'ok',
    staleTime: JIRA_STALE_MS,
    refetchInterval: JIRA_STALE_MS,
  });
  const detail = useQuery({
    ...jiraClient.issueQuery(space.id, issue ?? ''),
    enabled: !!conn && conn.state === 'ok' && !!issue,
  });
  const byKey = linksByKey(links);
  const err = list.isError ? jiraError(list.error) : null;
  const errorCode = list.isError ? (err?.code ?? 'unreachable') : null;
  // A token that stopped working shows at once everywhere: the connection reads expired too.
  useEffect(() => {
    if (errorCode === 'expired' && conn?.state === 'ok')
      void queryClient.invalidateQueries({ queryKey: ['jira', space.id, 'connection'] });
  }, [errorCode, conn?.state, space.id]);
  const state = panelState({
    connected: !!conn && !holding,
    reconnecting,
    expired: conn?.state === 'expired',
    online,
    hasData: !!list.data,
    pending: list.isPending,
    errorCode,
  });
  const issues = (list.data?.issues ?? []).map((i) => toPanelIssue(i, byKey));
  const synced = syncedWords(list.data?.syncedAt ?? conn?.syncedAt ?? null, now);
  const refreshing = list.isFetching && !list.isPending;

  const panelViews: PanelView[] = [
    { value: JIRA_ASSIGNED_VIEW, label: 'Assigned to me' },
    ...views.map((v) => ({ value: v.id, label: v.name, jql: v.jql, saved: true })),
  ];
  const view = pick.view === 'custom' ? 'custom' : 'view' in ask ? ask.view : JIRA_ASSIGNED_VIEW;

  const d = detail.data;
  const preview: JiraPreviewIssue | null =
    d && d.key === issue
      ? {
          key: d.key,
          summary: d.summary,
          status: d.status || undefined,
          due: d.due,
          issuetype: d.issuetype,
          assignee: d.assignee ? { name: d.assignee, initials: initialsOf(d.assignee, '') } : null,
          priority: d.priority,
          updated: d.updated ? whenWords(d.updated, now) : null,
          description: d.description,
          comments: d.comments.map((c) => ({
            key: c.id,
            who: c.who,
            initials: initialsOf(c.who, ''),
            when: c.at ? whenWords(c.at, now) : '',
            html: c.html,
          })),
          linked: (byKey.get(d.key) ?? []).map(toPanelLink),
        }
      : null;

  const loc = useRouterState({ select: (s) => s.location });
  const keepJira = (path: string) => {
    if (compact) return path;
    const j = jiraParam(loc.searchStr);
    return withJira({ pathname: path, searchStr: '' }, j.issue);
  };

  /** Show a linked task where it lives: the day turns to it and it glows, or the Backlog opens on it. */
  const showTask = (l: JiraPanelLink) => {
    if (compact) onIssue(null);
    if (l.day) {
      showDay(l.day, today);
      void navigate({ href: keepJira(spacePath(space.slug, 'today')) });
    } else {
      askBacklogView(l.done ? 'done' : 'open');
      void navigate({ href: keepJira(spacePath(space.slug, 'backlog')) });
    }
    locateTask(l.taskId, l.day);
  };

  const add = async (it: JiraPanelIssue, day: IsoDate | null) => {
    const id = taskStore.create(space.id, day, it.summary, undefined, { jira: it.key, source: 'jira' });
    // The task opens its gap on the day in view (and the Backlog, when that is where it went).
    if (day === shownDay || day === null || day === addDays(shownDay, 1)) flashTask(id, day);
    await new Promise((r) => setTimeout(r, ADD_BEAT_MS));
  };

  const connect = async (input: {
    site: string;
    token: string;
  }): Promise<{ error?: JiraConnectError } | void> => {
    try {
      if (!conn) setHolding(true);
      await jiraClient.connect(space.id, input.site, input.token);
    } catch (e) {
      setHolding(false);
      const je = jiraError(e);
      if (je) return { error: { field: je.field ?? 'site', message: je.error } };
      return {
        error: {
          field: 'site',
          message: 'Couldn’t reach Jira at this address. Check it, or that you’re on your company network.',
        },
      };
    }
  };

  const applyJql = async (jql: string): Promise<{ error?: string } | void> => {
    try {
      await queryClient.fetchQuery({ ...jiraClient.issuesQuery(space.id, { jql }), staleTime: 0 });
    } catch (e) {
      const je = jiraError(e);
      return { error: je?.code === 'jql' ? je.error : (je?.error ?? 'Jira didn’t answer. Try again.') };
    }
    setJiraPick(space.id, { view: 'custom', jql });
  };

  const removeView = (value: string) => {
    const index = views.findIndex((v) => v.id === value);
    const was = views[index];
    if (!was) return;
    setJiraPick(space.id, { view: JIRA_ASSIGNED_VIEW });
    void jiraClient.removeView(space.id, value).then(
      () =>
        showToast(`Removed “${was.name}”`, {
          action: 'Undo',
          onAction: () =>
            void jiraClient.restoreView(space.id, was, index).then(
              (back) => setJiraPick(space.id, { view: back.id }),
              () => showToast('Couldn’t put the view back.'),
            ),
        }),
      () => showToast('Couldn’t remove the view. Try again.'),
    );
  };

  if (!known && !compact) return null;
  return (
    <JiraPanel
      state={state}
      issues={issues}
      today={today}
      site={hostOf(conn)}
      siteUrl={conn?.site}
      synced={state === 'connect' ? null : synced}
      refreshing={refreshing}
      views={panelViews}
      view={view}
      jql={pick.view === 'custom' ? pick.jql : undefined}
      open={state === 'connect' || state === 'reconnect' ? null : issue}
      preview={preview}
      previewLoading={detail.isPending && !!issue}
      compact={compact}
      onView={(v) => setJiraPick(space.id, { view: v })}
      onApplyJql={applyJql}
      onSaveView={(name, jql) =>
        void jiraClient.saveView(space.id, name, jql).then(
          (v) => setJiraPick(space.id, { view: v.id }),
          (e: unknown) => showToast(jiraError(e)?.error ?? 'Couldn’t save the view. Try again.'),
        )
      }
      onRemoveView={removeView}
      onSearch={async (q) => {
        const r = await queryClient.fetchQuery(jiraClient.searchQuery(space.id, q));
        return r.issues.map((i) => toPanelIssue(i, linksByKey(links)));
      }}
      onAdd={add}
      onShowTask={(_it, l) => showTask(l)}
      onOpenIssue={onIssue}
      onOpenInJira={(key) => void openInJira(space.id, key)}
      onRefresh={() => {
        void list.refetch();
        void queryClient.invalidateQueries({
          queryKey: ['jira', space.id],
          predicate: (q) => q.queryKey[2] !== 'issues',
        });
      }}
      onRetry={() => void list.refetch()}
      onReconnect={() => setReconnecting(true)}
      onCancelReconnect={() => setReconnecting(false)}
      onDisconnect={() =>
        void jiraClient.disconnect(space.id).then(
          () => {
            onClose?.();
            if (compact) void navigate({ href: spacePath(space.slug, 'more') });
            showToast('Jira disconnected. Your tasks keep their Jira keys.');
          },
          () => showToast('Couldn’t disconnect Jira. Try again.'),
        )
      }
      onConnect={connect}
      onConnected={() => {
        setHolding(false);
        setReconnecting(false);
        setFromApps(false);
        markJiraFresh();
        void queryClient.invalidateQueries({ queryKey: ['jira', space.id] });
      }}
      onClose={onClose}
      onBack={
        state === 'connect' && fromApps
          ? () => {
              setFromApps(false);
              if (compact) void navigate({ href: spacePath(space.slug, 'apps') });
              else {
                onClose?.();
                openApps();
              }
            }
          : undefined
      }
      backLabel="Apps"
      className={vp === 'tablet' ? 'app-jira-tablet' : undefined}
    />
  );
}

/**
 * The Jira panel beside the page on the desk (560px) and tablets (460px): no veil, the day stays live, and it stays
 * open while you work and turn days. Its place is the address (`?jira`, `?jira=KEY`), so a reload keeps it and Back
 * closes it.
 */
export function JiraHost({ space }: { space: SpaceSummary }) {
  const vp = useViewport();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const j = jiraParam(loc.searchStr);
  const phone = vp === 'phone';
  // A phone reached with ?jira goes to the Jira page instead.
  useEffect(() => {
    if (phone && j.open)
      void navigate({
        href: `${spacePath(space.slug, 'jira')}${j.issue ? `?issue=${encodeURIComponent(j.issue)}` : ''}`,
        replace: true,
      });
  }, [phone, j.open, j.issue, space.slug, navigate]);
  if (phone) return null;
  const close = () => {
    setFromApps(false);
    void navigate({ href: withJira(loc, false) });
  };
  return (
    <Drawer open={j.open} onClose={close} label="Jira" modal={false} width={vp === 'tablet' ? 460 : 560}>
      {j.open ? (
        <JiraView
          space={space}
          issue={j.issue}
          onIssue={(key) => void navigate({ href: withJira(loc, key), replace: !!key === !!j.issue })}
          onClose={close}
        />
      ) : null}
    </Drawer>
  );
}

/** Apps on the desk and tablets: a 480px panel over the page. Connect opens the Jira panel on its form. */
export function AppsHost({ space }: { space: SpaceSummary }) {
  const vp = useViewport();
  const open = useAppsOpen();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const { conn } = useJira(space.id);
  if (vp === 'phone') return null;
  return (
    <Drawer open={open} onClose={closeApps} label="Apps" width={480}>
      <AppsList
        space={space}
        connected={conn ? { who: conn.who.email || conn.who.name, site: hostOf(conn)! } : null}
        onClose={closeApps}
        onJira={() => {
          closeApps();
          setFromApps(!conn);
          void navigate({ href: withJira(loc, null) });
        }}
      />
    </Drawer>
  );
}

/** The list of apps: Jira, with Connect, or Connected and Open. */
export function AppsList({
  connected,
  onJira,
  onClose,
  compact,
}: {
  space: SpaceSummary;
  connected: { who: string; site: string } | null;
  onJira: () => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  return (
    <AppsPanel
      compact={compact}
      onClose={onClose}
      apps={[
        {
          id: 'jira',
          name: 'Jira',
          blurb: 'Your Jira issues beside your day. Add one to a day and it becomes a linked task.',
          connected: !!connected,
          status: connected ? `As ${connected.who} on ${connected.site}.` : undefined,
        },
      ]}
      onConnect={onJira}
      onOpen={onJira}
    />
  );
}
