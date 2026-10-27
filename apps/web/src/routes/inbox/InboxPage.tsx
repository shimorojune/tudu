import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  acceptedInWords,
  acceptedWords,
  answeredWords,
  clearedWords,
  dayWord,
  dueLabel,
  formatDay,
  inboxBadge,
  inboxCountWords,
  inviteEndedWords,
  noMatchWords,
  noticeWords,
  nothingFromWords,
  sentWords,
  spaceInitials,
  whenWords,
  type InboxItem as InboxData,
  type InviteState,
  type SpaceSummary,
  type InboxView,
  type IsoDate,
  type Project,
  type TaskRequest,
} from '@tudu/core';
import {
  Banner,
  Button,
  DayHeader,
  EmptyState,
  FilterField,
  InboxItem,
  InboxSection,
  Segmented,
  Sheet,
  SpaceFilter,
  SheetBody,
  TaskListSkeleton,
  showToast,
  type InboxEntry,
  type InboxWho,
} from '@tudu/ui';
import { ApiError } from '@tudu/client';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../app/config';
import { desktop } from '../../app/desktop';
import { useAppInfo } from '../../app/DesktopHost';
import { appEntry, isAppItem, notesHref, restartToUpdate, updateStore, useUpdate } from '../../app/updates';
import { locateTask, showDay } from '../../app/dayView';
import { api, meQuery, queryClient } from '../../app/session';
import { inboxPath, spaceBySlug, spacePath, useSpace } from '../../app/space';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import './inbox.css';
import { taskLink } from '../../app/links';

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };
const VIEWS: Array<{ value: InboxView; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'answered', label: 'Answered' },
  { value: 'sent', label: 'Sent' },
];
const ORDER: InboxView[] = ['inbox', 'answered', 'sent'];

function who(p: {
  id: string;
  name: string;
  email: string;
  color: string | null;
  initials: string;
}): InboxWho {
  return { id: p.id, name: p.name || p.email, initials: p.initials, color: p.color };
}

/** A request's facts as the item shows them. */
function facts(r: TaskRequest, today: IsoDate, projects: Project[]) {
  const project = r.projectId ? projects.find((p) => p.id === r.projectId) : undefined;
  return {
    key: r.taskId ?? r.id,
    title: r.title,
    forLabel: r.askedDay ? formatDay(r.askedDay) : null,
    forIso: r.askedDay,
    due: r.due ? { label: dueLabel(r.due, today).label, overdue: dueLabel(r.due, today).overdue } : null,
    project: project ? { name: project.name, color: project.color } : null,
    note: r.note || null,
  };
}

/** An Inbox item as the design's entry. Every row names its space ("Northwind · Today"). */
export function toEntry(item: InboxData, today: IsoDate, now: Date, projects: Project[]): InboxEntry {
  const space = item.space?.name ?? item.spaceName ?? null;
  if (item.kind === 'comment' && item.comment) {
    const c = item.comment;
    return {
      id: item.id,
      kind: 'comment',
      who: who(c.author),
      space,
      when: whenWords(item.createdAt, now),
      unread: !item.readAt,
      text: 'commented on',
      quote: c.html,
      task: { key: c.task.id, title: c.task.title, where: dayWord(c.task.day, today) },
    };
  }
  if (item.kind === 'invite' && item.invite) {
    const v = item.invite;
    return {
      id: item.id,
      kind: 'invite',
      who: v.from ? who(v.from) : undefined,
      mark: v.from ? undefined : { name: v.space.name, initials: v.space.initials, color: v.space.color },
      space: v.state === 'open' ? null : inviteEndedWords(v.state).replace(/\.$/, ''),
      when: whenWords(item.createdAt, now),
      unread: !item.readAt,
      task: { key: v.id, title: v.space.name },
    };
  }
  if (item.kind === 'notice' && item.notice) {
    const n = item.notice;
    const name = item.spaceName;
    return {
      id: item.id,
      kind: 'notice',
      who: n.by ? { name: n.by, initials: spaceInitials(n.by) } : undefined,
      mark: { name, initials: spaceInitials(name) },
      when: whenWords(item.createdAt, now),
      unread: !item.readAt,
      text: n.by
        ? n.type === 'removed'
          ? 'removed you from'
          : 'deleted'
        : noticeWords(n, name).slice(name.length + 1),
      task: { key: item.id, title: name },
    };
  }
  const r = item.request!;
  if (item.kind === 'answer') {
    const accepted = r.state === 'accepted';
    return {
      id: item.id,
      kind: 'answer',
      space,
      who: who(r.to),
      when: whenWords(item.createdAt, now),
      unread: !item.readAt,
      text: accepted
        ? `accepted your task onto ${dayWord(r.taskDay, today)}`
        : `declined your task${r.reason ? `: ${r.reason}` : ''}`,
      task: { ...facts(r, today, projects), where: accepted ? dayWord(r.taskDay, today) : null },
    };
  }
  return {
    id: item.id,
    kind: 'request',
    space,
    who: who(r.from),
    when: whenWords(item.createdAt, now),
    unread: !item.readAt,
    task: facts(r, today, projects),
    outcome:
      r.state === 'accepted'
        ? { status: 'accepted', label: dayWord(r.taskDay, today) }
        : r.state === 'declined'
          ? { status: 'declined', reason: r.reason }
          : null,
  };
}

/** A request you sent, as the Sent list's entry. */
export function toSentEntry(r: TaskRequest, today: IsoDate, now: Date, projects: Project[]): InboxEntry {
  return {
    id: r.id,
    kind: 'sent',
    to: who(r.to),
    when: whenWords(r.createdAt, now),
    task: facts(r, today, projects),
    status:
      r.state === 'accepted'
        ? { state: 'accepted', label: dayWord(r.taskDay, today) }
        : r.state === 'declined'
          ? { state: 'declined', reason: r.reason }
          : {
              state: 'waiting',
              seen: r.seenAt ? whenWords(r.seenAt, now).replace(/^Just now$/, 'just now') : null,
            },
  };
}

/** Why Join didn't work: the invite's state from the server's answer, when it says. */
function endedState(err: unknown): InviteState | null {
  if (!(err instanceof ApiError)) return null;
  const st = (err.body as { state?: string } | null)?.state;
  if (st === 'expired' || st === 'cancelled' || st === 'spent') return st;
  return err.status === 410 || err.status === 404 ? 'cancelled' : null;
}

/**
 * The one Inbox, across every space, like mail: the list on the left (To answer, then Updates), the picked item in
 * full on the right; Inbox | Answered | Sent turns the list like a page; a search line and the space filter narrow
 * it. Every row names its space. On phones the list is the page and an item is its own page with ‹ Inbox.
 */
export function InboxPage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const shell = useSpace();
  const { today } = useWorkingDay();
  const online = useOnline();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { itemId?: string };
  const picked = params.itemId ?? null;
  const search = useSearch({ strict: false }) as { view?: InboxView; space?: string };
  const filterSpace: SpaceSummary | undefined =
    search.space && me ? spaceBySlug(me.spaces, search.space) : undefined;
  const spaceId = filterSpace?.id ?? null;
  const [view, setView] = useState<InboxView>(search.view ?? 'inbox');
  // Show on "Sent to Meera" opens the Inbox on Sent: the address asks for the view once.
  const [seenView, setSeenView] = useState(search.view);
  if (search.view !== seenView) {
    setSeenView(search.view);
    if (search.view && search.view !== view) setView(search.view);
  }
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [q, setQ] = useState('');
  const query = useQuery(taskStore.inboxQuery(view, q.trim(), spaceId));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const slug = filterSpace?.slug ?? null;
  const here = inboxPath({ space: slug });
  const compact = vp === 'phone';
  const data = query.data;

  // Each item's space has its own projects: a request names its project by them.
  const all: InboxData[] = data ? [...data.toAnswer, ...data.updates, ...data.answered] : [];
  const spaceIds = [
    ...new Set([
      ...all.map((i) => i.space?.id).filter((x): x is string => !!x),
      ...(data?.sent ?? []).map((r) => r.spaceId),
    ]),
  ];
  const projectLists = useQueries({ queries: spaceIds.map((id) => taskStore.projectsQuery(id)) });
  const projectsOf = (id: string | null | undefined): Project[] =>
    (id ? projectLists[spaceIds.indexOf(id)]?.data : undefined) ?? [];

  // The macOS app's new version, once downloaded: first in Updates (unfiltered), until restarted or deleted.
  const update = useUpdate();
  const appInfo = useAppInfo();
  const appName = appInfo?.name ?? 'Tudu';
  const [arrived] = useState(() => new Date().toISOString());
  const term = q.trim().toLowerCase();
  const appItem =
    update.ready &&
    !update.hidden &&
    !spaceId &&
    view === 'inbox' &&
    (!term || `${appName} ${update.ready.version} ${update.ready.notes}`.toLowerCase().includes(term))
      ? appEntry(update.ready, update.unread, now, appName, arrived)
      : null;

  // The open task over the Inbox, in its own space; closing lands back on the item.
  const [open, setOpen] = useState<(OpenTask & { spaceId: string }) | null>(null);
  const openTask = (taskId: string, inSpace: string) =>
    setOpen({ id: taskId, dir: 'next', spaceId: inSpace });
  const openSpace = me?.spaces.find((x) => x.id === open?.spaceId) ?? shell;

  // Join didn't work: the banner says why, with Remove.
  const [ended, setEnded] = useState<{ id: string; state: InviteState } | null>(null);

  const turnTo = (v: InboxView) => {
    setDir(ORDER.indexOf(v) > ORDER.indexOf(view) ? 'next' : 'prev');
    setView(v);
    if (picked) void navigate({ href: here, replace: true });
  };
  const select = (id: string | null) =>
    void navigate({ href: inboxPath({ item: id, space: slug }), replace: !compact });
  const narrow = (id: string | null) => {
    const to = id ? me?.spaces.find((x) => x.id === id) : undefined;
    void navigate({ href: inboxPath({ space: to?.slug ?? null }), replace: true });
  };

  // Reading an item clears its dot.
  const pickedApp = appItem && picked === appItem.id ? { ...appItem, unread: false } : null;
  const pickedItem = picked ? all.find((i) => i.id === picked) : undefined;
  const pickedSent = picked && !pickedItem ? data?.sent.find((r) => r.id === picked) : undefined;
  const readRef = useRef<string | null>(null);
  useEffect(() => {
    if (pickedItem && !pickedItem.readAt && readRef.current !== pickedItem.id) {
      readRef.current = pickedItem.id;
      taskStore.readItem(pickedItem.id);
    }
  }, [pickedItem]);
  const readVersion = pickedApp && update.ready ? update.ready.version : null;
  useEffect(() => {
    if (readVersion) updateStore.markRead(readVersion);
  }, [readVersion]);

  const entryOf = (i: InboxData) => toEntry(i, today, now, projectsOf(i.space?.id));
  const entries = (list: InboxData[]) => list.map(entryOf);
  const itemOf = (e: InboxEntry) => all.find((i) => i.id === e.id);
  const requestOf = (e: InboxEntry): TaskRequest | undefined =>
    itemOf(e)?.request ?? data?.sent.find((r) => r.id === e.id);
  const taskOf = (e: InboxEntry): { id: string; spaceId: string } | undefined => {
    const i = itemOf(e);
    const id =
      i?.comment?.task.id ?? i?.request?.taskId ?? data?.sent.find((r) => r.id === e.id)?.taskId ?? undefined;
    const sp = i?.space?.id ?? data?.sent.find((r) => r.id === e.id)?.spaceId;
    return id && sp ? { id, spaceId: sp } : undefined;
  };
  const moveOn = (fromId: string) => {
    // The pane moves on to the next item in the list when the picked one is answered or goes.
    const rest = all.filter(
      (i) => i.id !== fromId && !(i.kind === 'request' && i.request!.state !== 'waiting'),
    );
    if (!compact && picked === fromId) select(rest[0]?.id ?? null);
    else if (compact && picked === fromId) select(null);
  };
  /** Delete one row, with Undo. The Mac's new version is hidden on this Mac instead. */
  const remove = (e: InboxEntry, words = 'Deleted.') => {
    if (isAppItem(e.id)) {
      const v = update.ready?.version;
      if (!v) return;
      updateStore.hide(v);
      if (picked === e.id) select(null);
      showToast(words, { action: 'Undo', onAction: () => updateStore.hide(v, false) });
      return;
    }
    taskStore.deleteItem(e.id);
    moveOn(e.id);
    if (ended?.id === e.id) setEnded(null);
    showToast(words, { action: 'Undo', onAction: () => taskStore.restoreItems([e.id]) });
  };
  const handlers = {
    onAccept: (e: InboxEntry, day: IsoDate | null) => {
      const r = requestOf(e);
      if (!r) return;
      taskStore.acceptRequest(r, day);
      moveOn(e.id);
      const from = me?.spaces.find((x) => x.id === r.spaceId);
      showToast(
        from && from.id !== shell.id ? acceptedInWords(day, today, from.name) : acceptedWords(day, today),
        {
          action: 'Show',
          onAction: () => turnTo('answered'),
        },
      );
    },
    onDecline: (e: InboxEntry, reason: string) => {
      const r = requestOf(e);
      if (!r) return;
      taskStore.declineRequest(r, reason);
      moveOn(e.id);
    },
    onOpen: (e: InboxEntry) => {
      // The version's own item from the list: its notes in the reading pane.
      if (isAppItem(e.id)) {
        if (picked !== e.id) select(e.id);
        return;
      }
      const t = taskOf(e);
      if (t) openTask(t.id, t.spaceId);
    },
    onReply: (e: InboxEntry, text: string) => {
      const t = taskOf(e);
      if (!t) return;
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      taskStore.addComment(t.id, `<p>${esc.replace(/\n/g, '<br>')}</p>`);
      showToast('Your reply is on the task');
    },
    onWithdraw: (e: InboxEntry) => {
      const r = requestOf(e);
      if (!r) return;
      const taskId = taskStore.withdrawRequest(r, null);
      if (picked === e.id) select(null);
      showToast('Taken back. It’s on your Backlog.', {
        action: 'Undo',
        onAction: () => {
          taskStore.remove(taskId);
          taskStore.sendRequest(r.spaceId, r.to.id, {
            title: r.title,
            note: r.note,
            askedDay: r.askedDay,
            due: r.due,
            projectId: r.projectId,
          });
        },
      });
    },
    onTakeBack: (e: InboxEntry, day: IsoDate | null) => {
      const r = requestOf(e);
      if (!r) return;
      taskStore.withdrawRequest(r, day);
      if (picked === e.id) select(null);
      showToast(`On ${dayWord(day, today)} now. You’ve got it.`);
    },
    onPerson: (w: InboxWho) => {
      const r = picked ? (pickedItem?.request ?? pickedSent) : undefined;
      const sp = me?.spaces.find((x) => x.id === r?.spaceId) ?? shell;
      if (w.id) void navigate({ href: `${spacePath(sp.slug, 'people')}/${w.id}` });
    },
    onJoin: async (e: InboxEntry) => {
      const v = itemOf(e)?.invite;
      if (!v) return;
      try {
        const out = await api.post<{ space: SpaceSummary }>(`/api/invites/${v.id}/join`);
        setEnded(null);
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        void queryClient.invalidateQueries({ queryKey: ['inbox'] });
        moveOn(e.id);
        showToast(`Joined ${out.space.name}.`, {
          action: 'Open',
          onAction: () => void navigate({ href: spacePath(out.space.slug) }),
        });
      } catch (err) {
        const st = endedState(err);
        if (st) setEnded({ id: e.id, state: st });
        else showToast('Couldn’t join just now. Try again in a moment.');
        throw err;
      }
    },
    onNotNow: (e: InboxEntry) => remove(e, 'Put away. The email’s link still works.'),
    onToggleRead: (e: InboxEntry) => {
      if (isAppItem(e.id)) {
        const v = update.ready?.version;
        if (v && e.unread) updateStore.markRead(v);
        else if (v) updateStore.markUnread(v);
        return;
      }
      if (e.unread) taskStore.readItem(e.id);
      else taskStore.unreadItem(e.id);
    },
    onDelete: (e: InboxEntry) => remove(e),
  };
  const calendar = { today, marks: {} };
  if (!me) return null;

  const counts = data
    ? { ...data.counts, unread: data.counts.unread + (appItem?.unread ? 1 : 0) }
    : undefined;
  const headCount = !data
    ? ''
    : view === 'inbox'
      ? inboxCountWords(counts!)
      : view === 'answered'
        ? answeredWords(data.answered.length)
        : sentWords(data.sent);
  const searching = !!q.trim();
  const empty =
    data &&
    !appItem &&
    !data.toAnswer.length &&
    !data.updates.length &&
    !data.answered.length &&
    !data.sent.length;
  const clearAll = () => {
    const ids = data!.updates.map((u) => u.id);
    const v = appItem && update.ready ? update.ready.version : null;
    const n = ids.length + (v ? 1 : 0);
    taskStore.clearItems(ids);
    if (v) updateStore.hide(v);
    if (picked && (ids.includes(picked) || picked === appItem?.id)) select(null);
    showToast(clearedWords(n), {
      action: 'Undo',
      onAction: () => {
        taskStore.restoreItems(ids);
        if (v) updateStore.hide(v, false);
      },
    });
  };
  const rowProps = {
    mode: 'list' as const,
    selectedKey: picked,
    calendar,
    onSelect: (e: InboxEntry) => select(e.id),
    onToggleRead: handlers.onToggleRead,
    onDelete: handlers.onDelete,
    swipe: compact,
  };

  let list;
  if (query.isPending) list = <TaskListSkeleton rows={4} compact />;
  else if (query.isError && !data)
    list = (
      <div className="app-ix-banner">
        <Banner
          tone="error"
          title="Couldn’t load your Inbox."
          action={query.isFetching ? 'Trying again…' : 'Try again'}
          onAction={() => void query.refetch()}
        >
          Check your connection.
        </Banner>
      </div>
    );
  else if (searching && empty)
    list = (
      <div className="app-ix-nomatch">
        <p>{noMatchWords(q)}</p>
        <Button variant="secondary" size="sm" onClick={() => setQ('')}>
          Clear search
        </Button>
      </div>
    );
  else if (view === 'inbox' && empty && filterSpace)
    list = (
      <EmptyState
        title={`${nothingFromWords(filterSpace.name)}.`}
        icon="inbox"
        action="See every space"
        plain
        onAction={() => narrow(null)}
      >
        Requests and updates from {filterSpace.name} land here.
      </EmptyState>
    );
  else if (view === 'inbox' && empty)
    list = (
      <EmptyState
        title="All caught up."
        icon="inbox"
        action="See what you answered"
        plain
        onAction={() => turnTo('answered')}
      >
        Tasks people send you, invites and updates on your tasks land here, from every space.
      </EmptyState>
    );
  else if (view === 'answered' && empty)
    list = (
      <EmptyState
        title="Nothing answered yet."
        icon="inbox"
        action="Back to the Inbox"
        plain
        onAction={() => turnTo('inbox')}
      >
        Requests you accept or decline move here, with what you did.
      </EmptyState>
    );
  else if (view === 'sent' && empty)
    list = (
      <EmptyState title="Nothing sent." icon="send" mark={false}>
        Tasks you send to people wait here until they answer.
      </EmptyState>
    );
  else if (view === 'inbox')
    list = (
      <>
        {data!.toAnswer.length ? (
          <InboxSection
            title="To answer"
            count={data!.toAnswer.length}
            items={entries(data!.toAnswer)}
            {...rowProps}
          />
        ) : null}
        {data!.updates.length || appItem ? (
          <InboxSection
            title="Updates"
            action="Clear all"
            onAction={clearAll}
            items={[...(appItem ? [appItem] : []), ...entries(data!.updates)]}
            {...rowProps}
          />
        ) : null}
      </>
    );
  else if (view === 'answered')
    list = <InboxSection title="Answered" items={entries(data!.answered)} {...rowProps} />;
  else
    list = (
      <InboxSection
        title="Sent"
        items={data!.sent.map((r) => toSentEntry(r, today, now, projectsOf(r.spaceId)))}
        mode="list"
        selectedKey={picked}
        calendar={calendar}
        onSelect={(e) => select(e.id)}
      />
    );

  // What's new: the ready version's release on GitHub, opened in the browser (none for Tudu Test or dev).
  const notes = pickedApp ? notesHref(appInfo, update.ready) : null;
  const pickedEntry = pickedApp
    ? pickedApp
    : pickedItem
      ? entryOf(pickedItem)
      : pickedSent
        ? toSentEntry(pickedSent, today, now, projectsOf(pickedSent.spaceId))
        : null;
  const pane = pickedEntry ? (
    <InboxItem
      key={pickedEntry.id}
      item={pickedEntry}
      mode="full"
      calendar={calendar}
      fileBase={API_URL}
      onBack={compact ? () => select(null) : undefined}
      backLabel="Inbox"
      className={compact ? 'tp-ix-phone' : undefined}
      onUpdate={() => {
        const d = desktop();
        return d ? restartToUpdate(d, appName) : undefined;
      }}
      onNotes={
        notes
          ? () =>
              void desktop()
                ?.openExternal(notes)
                .catch(() => {})
          : undefined
      }
      {...handlers}
    />
  ) : compact ? null : (
    <div className="app-ix-blank" aria-hidden="true" />
  );

  const filterSpaces = me.spaces.map((x) => ({
    id: x.id,
    name: x.name,
    color: x.color,
    initials: spaceInitials(x.name),
    personal: x.kind === 'personal',
    count: data ? inboxBadge(data.bySpace[x.id]) : undefined,
  }));
  const header = (
    <DayHeader day="Inbox" date={headCount} nav={false} compact>
      <Segmented items={VIEWS} value={view} onChange={turnTo} label="View" />
      <FilterField value={q} onChange={setQ} placeholder="Search" label="Search the Inbox" />
      <SpaceFilter
        spaces={filterSpaces}
        total={counts ? inboxBadge(counts) : undefined}
        value={spaceId}
        onChange={narrow}
      />
    </DayHeader>
  );
  const banner = !online ? (
    <Banner tone="warning" title="You’re offline.">
      Your answers send when you’re back.
    </Banner>
  ) : null;
  const endedBanner = ended ? (
    <div className="app-ix-banner">
      <Banner
        tone="error"
        title={inviteEndedWords(ended.state)}
        action="Remove"
        onAction={() => {
          const e = all.find((i) => i.id === ended.id);
          setEnded(null);
          if (e) remove(entryOf(e), 'Removed.');
        }}
      >
        Ask whoever invited you to send a new one.
      </Banner>
    </div>
  ) : null;
  const panel = (
    <TaskPanel
      spaceId={openSpace.id}
      open={open}
      today={today}
      vp={vp}
      me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
      onClose={() => setOpen(null)}
      onStep={() => {}}
      linkFor={taskLink}
      backFor={() => 'Inbox'}
      onLocate={(day) => {
        setOpen(null);
        const id = open?.id;
        if (!id) return;
        if (day === null) {
          void navigate({ href: spacePath(openSpace.slug, 'backlog') });
          locateTask(id, null);
          return;
        }
        showDay(day, today);
        void navigate({ href: spacePath(openSpace.slug) });
        locateTask(id, day);
      }}
    />
  );

  if (compact)
    return (
      <div className="app-page app-inbox app-inbox-phone">
        {banner}
        <Sheet
          label={pickedEntry ? 'Inbox item' : 'The Inbox'}
          fill
          minHeight={MIN_HEIGHT[vp]}
          turnKey={picked ?? 'list'}
          turnDir={picked ? 'next' : 'prev'}
        >
          {pickedEntry ? (
            <SheetBody className="app-panes-scroll">
              {endedBanner}
              {pane}
            </SheetBody>
          ) : (
            <>
              {header}
              <SheetBody className="app-panes-scroll">
                {endedBanner}
                <Sheet plain as="div" label={view} turnKey={`${view}:${spaceId ?? 'all'}`} turnDir={dir}>
                  {list}
                </Sheet>
              </SheetBody>
            </>
          )}
        </Sheet>
        {panel}
      </div>
    );
  return (
    <div className="app-page app-inbox">
      {banner}
      <Sheet label="The Inbox" fill minHeight={MIN_HEIGHT[vp]}>
        <div className="app-panes app-ix-panes">
          <div className="app-panes-l">
            {header}
            <SheetBody className="app-panes-scroll">
              {endedBanner}
              <Sheet plain as="div" label={view} turnKey={`${view}:${spaceId ?? 'all'}`} turnDir={dir}>
                {list}
              </Sheet>
            </SheetBody>
          </div>
          <div className="app-panes-r app-ix-r">{pane}</div>
        </div>
      </Sheet>
      {panel}
    </div>
  );
}
