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
import { jiraConnectionKey, jiraError, jiraLinksKey, type JiraListAsk } from '@tudu/client';
import {
  AppsPanel,
  ConfirmDialog,
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
  glowJiraSpace,
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
  takeJiraReconnect,
  turnOffHere,
  withJira,
  type JiraPick,
} from './jira';
import { initialsOf, meQuery, queryClient } from './session';
import { settingsHref } from './settings';
import { spacePath } from './space';
import { taskStore, useOnline } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';

/** The spinner on an issue's calendar button shows at least this long, so adding reads as a step. */
const ADD_BEAT_MS = 450;

/** Which space a link's task lives in, when it is not the one you are in: the chip names it. */
export type SpaceOf = (spaceId: string) => SpaceSummary | undefined;

export const toPanelLink = (l: JiraLink, here?: string, spaceOf?: SpaceOf): JiraPanelLink => {
  const s = here && l.spaceId !== here ? spaceOf?.(l.spaceId) : undefined;
  return {
    taskId: l.taskId,
    id: l.ref,
    title: l.title,
    day: l.day,
    done: l.done,
    ...(s ? { space: { name: s.name, color: s.color ?? undefined, personal: s.kind === 'personal' } } : {}),
  };
};

/** An issue as the panel's row, with the tasks of yours linked to it, in any of your spaces. */
export function toPanelIssue(
  i: JiraIssue,
  links: Map<string, JiraLink[]>,
  here?: string,
  spaceOf?: SpaceOf,
): JiraPanelIssue {
  return {
    key: i.key,
    summary: i.summary,
    status: i.status || undefined,
    due: i.due,
    linked: (links.get(i.key) ?? []).map((l) => toPanelLink(l, here, spaceOf)),
  };
}

/**
 * Turn off here, from an Apps card: the card keeps showing on, with Turning off…, until the server answers; then it
 * reads off here and the toast offers Undo. A refusal says why under the card and Jira stays on.
 */
export function useTurnOffHere(space: SpaceSummary): {
  busy: boolean;
  error: string | null;
  disable: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disable = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void turnOffHere(space, { quiet: true }).then((ok) => {
      setBusy(false);
      if (!ok) setError('Couldn’t turn Jira off here. Check your connection and try again.');
    });
  };
  return { busy, error, disable };
}

/** Turn on here, from an Apps card: the button spins while the server answers, and Jira fades in. */
export function useTurnOnHere(spaceId: string, after?: () => void): { busy: boolean; enable: () => void } {
  const [busy, setBusy] = useState(false);
  const enable = () => {
    setBusy(true);
    void jiraClient.setOn(spaceId, true).then(
      () => {
        setBusy(false);
        after?.();
        markJiraFresh();
      },
      () => {
        setBusy(false);
        showToast('Couldn’t turn Jira on here. Try again.');
      },
    );
  };
  return { busy, enable };
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
  const { conn, connected, onHere, known, links } = useJira(space.id);
  const pick = useJiraPick();
  const me = useQuery(meQuery).data;
  const spaceOf: SpaceOf = (id) => me?.spaces.find((x) => x.id === id);
  const here = useTurnOnHere(space.id);
  const loc = useRouterState({ select: (s) => s.location });
  const [askDisconnect, setAskDisconnect] = useState(false);
  const [reconnecting, setReconnecting] = useState(takeJiraReconnect);
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
      void queryClient.invalidateQueries({ queryKey: jiraConnectionKey() });
  }, [errorCode, conn?.state]);
  const state = panelState({
    connected: (!!conn || (reconnecting && !!connected)) && !holding,
    reconnecting,
    expired: conn?.state === 'expired',
    online,
    hasData: !!list.data,
    pending: list.isPending,
    errorCode,
  });
  const issues = (list.data?.issues ?? []).map((i) => toPanelIssue(i, byKey, space.id, spaceOf));
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
          linked: (byKey.get(d.key) ?? []).map((l) => toPanelLink(l, space.id, spaceOf)),
        }
      : null;

  const loc = useRouterState({ select: (s) => s.location });
  const keepJira = (path: string) => {
    if (compact) return path;
    const j = jiraParam(loc.searchStr);
    return withJira({ pathname: path, searchStr: '' }, j.issue);
  };

  /**
   * Show a linked task where it lives: the day turns to it and it glows, or the Backlog opens on it. A task in
   * another of your spaces takes you to that space.
   */
  const showTask = (l: JiraPanelLink) => {
    if (compact) onIssue(null);
    const there = links.find((x) => x.taskId === l.taskId);
    const slug =
      (there && there.spaceId !== space.id ? spaceOf(there.spaceId)?.slug : undefined) ?? space.slug;
    if (l.day) {
      showDay(l.day, today);
      void navigate({ href: keepJira(spacePath(slug, 'today')) });
    } else {
      askBacklogView(l.done ? 'done' : 'open');
      void navigate({ href: keepJira(spacePath(slug, 'backlog')) });
    }
    locateTask(l.taskId, l.day);
  };

  const add = async (it: JiraPanelIssue, day: IsoDate | null) => {
    const id = taskStore.create(space.id, day, it.summary, undefined, {
      link: { provider: 'jira', key: it.key },
      source: 'connector',
    });
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
      // A new token for an expired connection keeps the switches as they were; a first connect turns Jira on here.
      await jiraClient.connect(input.site, input.token, reconnecting ? undefined : space.id);
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
    setJiraPick({ view: 'custom', jql });
  };

  const removeView = (value: string) => {
    const index = views.findIndex((v) => v.id === value);
    const was = views[index];
    if (!was) return;
    setJiraPick({ view: JIRA_ASSIGNED_VIEW });
    void jiraClient.removeView(value).then(
      () =>
        showToast(`Removed “${was.name}”`, {
          action: 'Undo',
          onAction: () =>
            void jiraClient.restoreView(was, index).then(
              (back) => setJiraPick({ view: back.id }),
              () => showToast('Couldn’t put the view back.'),
            ),
        }),
      () => showToast('Couldn’t remove the view. Try again.'),
    );
  };

  // Mid-connect the form stays up whatever the reads say, so its Connected tick can finish.
  if (!known && !compact && !holding) return null;
  // Connected for your account but off here: the Apps card's Turn on here, never a second token.
  if (connected && !onHere && known && !reconnecting)
    return (
      <AppsList
        space={space}
        compact={compact}
        connected={{ who: connected.who.email || connected.who.name, site: hostOf(connected)! }}
        off
        busy={here.busy}
        onClose={onClose}
        onEnable={here.enable}
        onJira={() => {}}
      />
    );
  // Off here or disconnected, the panel has nothing to show: it goes (on phones, back to More).
  const leave = () => {
    onClose?.();
    if (compact) void navigate({ href: spacePath(space.slug, 'more') });
  };
  return (
    <>
    <JiraPanel
      state={state}
      issues={issues}
      today={today}
      site={hostOf(conn)}
      siteUrl={(conn ?? connected)?.site}
      synced={state === 'connect' ? null : synced}
      refreshing={refreshing}
      views={panelViews}
      view={view}
      jql={pick.view === 'custom' ? pick.jql : undefined}
      open={state === 'connect' || state === 'reconnect' ? null : issue}
      preview={preview}
      previewLoading={detail.isPending && !!issue}
      compact={compact}
      onView={(v) => setJiraPick({ view: v })}
      onApplyJql={applyJql}
      onSaveView={(name, jql) =>
        void jiraClient.saveView(name, jql).then(
          (v) => setJiraPick({ view: v.id }),
          (e: unknown) => showToast(jiraError(e)?.error ?? 'Couldn’t save the view. Try again.'),
        )
      }
      onRemoveView={removeView}
      onSearch={async (q) => {
        const r = await queryClient.fetchQuery(jiraClient.searchQuery(space.id, q));
        return r.issues.map((i) => toPanelIssue(i, linksByKey(links), space.id, spaceOf));
      }}
      onAdd={add}
      onShowTask={(_it, l) => showTask(l)}
      onOpenIssue={onIssue}
      onOpenInJira={(key) => void openInJira(space.id, key)}
      onRefresh={() => {
        void list.refetch();
        void queryClient.invalidateQueries({ queryKey: jiraConnectionKey() });
        void queryClient.invalidateQueries({ queryKey: jiraLinksKey() });
      }}
      onRetry={() => void list.refetch()}
      onReconnect={() => setReconnecting(true)}
      onCancelReconnect={() => setReconnecting(false)}
      onDisconnect={() => setAskDisconnect(true)}
      onTurnOff={() => {
        leave();
        void turnOffHere(space);
      }}
      onManage={() => {
        glowJiraSpace(space.id);
        setFromApps(false);
        if (compact) {
          void navigate({ href: settingsHref(loc, space.slug, 'apps', true) });
          return;
        }
        const q = new URLSearchParams(loc.searchStr);
        q.delete('jira');
        void navigate({
          href: settingsHref({ pathname: loc.pathname, searchStr: q.toString() }, space.slug, 'apps', false),
        });
      }}
      onConnect={connect}
      onConnected={() => {
        setHolding(false);
        setReconnecting(false);
        setFromApps(false);
        markJiraFresh();
        void queryClient.invalidateQueries({ queryKey: ['jira'] });
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
      spaceName={space.name}
      className={vp === 'tablet' ? 'app-jira-tablet' : undefined}
    />
    <ConfirmDialog
      open={askDisconnect}
      variant={compact ? 'sheet' : 'dialog'}
      title="Disconnect Jira?"
      confirmLabel="Disconnect Jira"
      onClose={() => setAskDisconnect(false)}
      onConfirm={async () => {
        try {
          await jiraClient.disconnect();
        } catch (err) {
          showToast('Couldn’t disconnect Jira. Try again.');
          throw err;
        }
        setAskDisconnect(false);
        leave();
        showToast('Jira disconnected from all your spaces. Your tasks keep their Jira keys.');
      }}
    >
      Jira goes from every space you turned it on in, with your saved views. Your tasks keep their Jira keys. To hide
      it only in {space.name}, use Turn off in {space.name} instead.
    </ConfirmDialog>
    </>
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
  const { connected, onHere } = useJira(space.id);
  const here = useTurnOnHere(space.id, closeApps);
  const off = useTurnOffHere(space);
  if (vp === 'phone') return null;
  return (
    <Drawer open={open} onClose={closeApps} label="Apps" width={480}>
      <AppsList
        space={space}
        connected={
          connected ? { who: connected.who.email || connected.who.name, site: hostOf(connected)! } : null
        }
        off={!!connected && !onHere && !off.busy}
        busy={here.busy || off.busy}
        error={off.error}
        onClose={closeApps}
        onEnable={here.enable}
        onDisable={off.disable}
        onJira={() => {
          closeApps();
          setFromApps(!connected);
          void navigate({ href: withJira(loc, null) });
        }}
      />
    </Drawer>
  );
}

/** The list of apps: Jira, with Connect; Connected and Open; or connected, off here, and Turn on here. */
export function AppsList({
  space,
  connected,
  off,
  busy,
  error,
  onJira,
  onEnable,
  onDisable,
  onClose,
  compact,
}: {
  space: SpaceSummary;
  connected: { who: string; site: string } | null;
  /** Connected for your account, but off in this space. */
  off?: boolean;
  busy?: boolean;
  /** Why it couldn't be turned off here. */
  error?: string | null;
  onJira: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
  onClose?: () => void;
  compact?: boolean;
}) {
  return (
    <AppsPanel
      compact={compact}
      onClose={onClose}
      spaceName={space.name}
      onEnable={onEnable}
      onDisable={onDisable}
      apps={[
        {
          id: 'jira',
          name: 'Jira',
          blurb: 'Your Jira issues beside your day. Add one to a day and it becomes a linked task.',
          connected: !!connected,
          status: connected ? `As ${connected.who} on ${connected.site}.` : undefined,
          off: !!connected && !!off,
          busy,
          error: error ?? undefined,
        },
      ]}
      onConnect={onJira}
      onOpen={onJira}
    />
  );
}
