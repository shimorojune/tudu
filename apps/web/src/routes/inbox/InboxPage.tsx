import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  acceptedWords,
  answeredWords,
  dayWord,
  dueLabel,
  formatDay,
  inboxCountWords,
  noMatchWords,
  sentWords,
  whenWords,
  type InboxItem as InboxData,
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
  SheetBody,
  TaskListSkeleton,
  showToast,
  type InboxEntry,
  type InboxWho,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../../app/config';
import { locateTask, showDay } from '../../app/dayView';
import { meQuery } from '../../app/session';
import { spacePath, useSpace } from '../../app/space';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import './inbox.css';

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

/** An Inbox item as the design's entry. */
export function toEntry(item: InboxData, today: IsoDate, now: Date, projects: Project[]): InboxEntry {
  if (item.kind === 'comment' && item.comment) {
    const c = item.comment;
    return {
      id: item.id,
      kind: 'comment',
      who: who(c.author),
      when: whenWords(item.createdAt, now),
      unread: !item.readAt,
      text: 'commented on',
      quote: c.html,
      task: { key: c.task.id, title: c.task.title, where: dayWord(c.task.day, today) },
    };
  }
  const r = item.request!;
  if (item.kind === 'answer') {
    const accepted = r.state === 'accepted';
    return {
      id: item.id,
      kind: 'answer',
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

/**
 * The Inbox, one per space, like mail: the list on the left (To answer, then Updates), the picked item in full on
 * the right; Inbox | Answered | Sent turns the list like a page; a search line narrows the open view. On phones the
 * list is the page and an item is its own page with ‹ Inbox.
 */
export function InboxPage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const space = useSpace();
  const { today } = useWorkingDay();
  const online = useOnline();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { itemId?: string };
  const picked = params.itemId ?? null;
  const search = useSearch({ strict: false }) as { view?: InboxView };
  const [view, setView] = useState<InboxView>(search.view ?? 'inbox');
  // Show on "Sent to Meera" opens the Inbox on Sent: the address asks for the view once.
  const [seenView, setSeenView] = useState(search.view);
  if (search.view !== seenView) {
    setSeenView(search.view);
    if (search.view && search.view !== view) setView(search.view);
  }
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [q, setQ] = useState('');
  const query = useQuery(taskStore.inboxQuery(space.id, view, q.trim()));
  const projects = useQuery(taskStore.projectsQuery(space.id)).data ?? [];
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const here = spacePath(space.slug, 'inbox');
  const compact = vp === 'phone';
  const data = query.data;

  // The open task over the Inbox: in the address as its ref, so a reload keeps it; closing lands back on the item.
  const [open, setOpen] = useState<OpenTask | null>(null);
  const openTask = (taskId: string) => setOpen({ id: taskId, dir: 'next' });

  const turnTo = (v: InboxView) => {
    setDir(ORDER.indexOf(v) > ORDER.indexOf(view) ? 'next' : 'prev');
    setView(v);
    if (picked) void navigate({ href: here, replace: true });
  };
  const select = (id: string | null) =>
    void navigate({ href: id ? `${here}/${id}` : here, replace: !compact });

  // Reading an item clears its dot.
  const all: InboxData[] = data ? [...data.toAnswer, ...data.updates, ...data.answered] : [];
  const pickedItem = picked ? all.find((i) => i.id === picked) : undefined;
  const pickedSent = picked && !pickedItem ? data?.sent.find((r) => r.id === picked) : undefined;
  const readRef = useRef<string | null>(null);
  useEffect(() => {
    if (pickedItem && !pickedItem.readAt && readRef.current !== pickedItem.id) {
      readRef.current = pickedItem.id;
      taskStore.readItem(space.id, pickedItem.id);
    }
  }, [pickedItem, space.id]);

  const entries = (list: InboxData[]) => list.map((i) => toEntry(i, today, now, projects));
  const requestOf = (e: InboxEntry): TaskRequest | undefined =>
    all.find((i) => i.id === e.id)?.request ?? data?.sent.find((r) => r.id === e.id);
  const taskIdOf = (e: InboxEntry): string | undefined => {
    const i = all.find((x) => x.id === e.id);
    return (
      i?.comment?.task.id ?? i?.request?.taskId ?? data?.sent.find((r) => r.id === e.id)?.taskId ?? undefined
    );
  };
  const moveOn = (fromId: string) => {
    // The pane moves on to the next item in the list when the picked one is answered.
    const rest = all.filter(
      (i) => i.id !== fromId && !(i.kind === 'request' && i.request!.state !== 'waiting'),
    );
    if (!compact && picked === fromId) select(rest[0]?.id ?? null);
    else if (compact && picked === fromId) select(null);
  };
  const handlers = {
    onAccept: (e: InboxEntry, day: IsoDate | null) => {
      const r = requestOf(e);
      if (!r) return;
      taskStore.acceptRequest(r, day);
      moveOn(e.id);
      showToast(acceptedWords(day, today), { action: 'Show', onAction: () => turnTo('answered') });
    },
    onDecline: (e: InboxEntry, reason: string) => {
      const r = requestOf(e);
      if (!r) return;
      taskStore.declineRequest(r, reason);
      moveOn(e.id);
    },
    onOpen: (e: InboxEntry) => {
      const id = taskIdOf(e);
      if (id) openTask(id);
    },
    onReply: (e: InboxEntry, text: string) => {
      const id = taskIdOf(e);
      if (!id) return;
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      taskStore.addComment(id, `<p>${esc.replace(/\n/g, '<br>')}</p>`);
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
      if (w.id) void navigate({ href: `${spacePath(space.slug, 'people')}/${w.id}` });
    },
  };
  const calendar = { today, marks: {} };
  if (!me) return null;

  const counts = data?.counts;
  const headCount = !data
    ? ''
    : view === 'inbox'
      ? inboxCountWords(counts!)
      : view === 'answered'
        ? answeredWords(data.answered.length)
        : sentWords(data.sent);
  const searching = !!q.trim();
  const empty =
    data && !data.toAnswer.length && !data.updates.length && !data.answered.length && !data.sent.length;

  let list;
  if (query.isPending) list = <TaskListSkeleton rows={4} compact />;
  else if (query.isError && !data)
    list = (
      <EmptyState
        tone="error"
        title="Couldn’t load the Inbox."
        action="Try again"
        loading={query.isFetching}
        loadingLabel="Trying again"
        onAction={() => void query.refetch()}
      >
        Check your connection.
      </EmptyState>
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
  else if (view === 'inbox' && empty)
    list = (
      <EmptyState
        title="All caught up."
        icon="inbox"
        action="See what you answered"
        plain
        onAction={() => turnTo('answered')}
      >
        Tasks people send you and updates on your tasks land here.
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
            mode="list"
            selectedKey={picked}
            calendar={calendar}
            onSelect={(e) => select(e.id)}
          />
        ) : null}
        {data!.updates.length ? (
          <InboxSection
            title="Updates"
            action={data!.updates.some((u) => !u.readAt) ? 'Mark all as read' : undefined}
            onAction={() => taskStore.readAll(space.id)}
            items={entries(data!.updates)}
            mode="list"
            selectedKey={picked}
            calendar={calendar}
            onSelect={(e) => select(e.id)}
          />
        ) : null}
      </>
    );
  else if (view === 'answered')
    list = (
      <InboxSection
        title="Answered"
        items={entries(data!.answered)}
        mode="list"
        selectedKey={picked}
        calendar={calendar}
        onSelect={(e) => select(e.id)}
      />
    );
  else
    list = (
      <InboxSection
        title="Sent"
        items={data!.sent.map((r) => toSentEntry(r, today, now, projects))}
        mode="list"
        selectedKey={picked}
        calendar={calendar}
        onSelect={(e) => select(e.id)}
      />
    );

  const pickedEntry = pickedItem
    ? toEntry(pickedItem, today, now, projects)
    : pickedSent
      ? toSentEntry(pickedSent, today, now, projects)
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
      {...handlers}
    />
  ) : compact ? null : (
    <div className="app-ix-blank" aria-hidden="true" />
  );

  const header = (
    <DayHeader day="Inbox" date={headCount} nav={false} compact>
      <FilterField value={q} onChange={setQ} placeholder="Search" label="Search the Inbox" />
      <Segmented items={VIEWS} value={view} onChange={turnTo} label="View" />
    </DayHeader>
  );
  const banner = !online ? (
    <Banner tone="warning" title="You’re offline.">
      Your answers send when you’re back.
    </Banner>
  ) : null;
  const panel = (
    <TaskPanel
      spaceId={space.id}
      open={open}
      today={today}
      vp={vp}
      me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
      onClose={() => setOpen(null)}
      onStep={() => {}}
      linkFor={(ref) => `${window.location.origin}/t/${ref}`}
      backFor={() => 'Inbox'}
      onLocate={(day) => {
        setOpen(null);
        const id = open?.id;
        if (!id) return;
        if (day === null) {
          void navigate({ href: spacePath(space.slug, 'backlog') });
          locateTask(id, null);
          return;
        }
        showDay(day, today);
        void navigate({ href: spacePath(space.slug) });
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
            <SheetBody className="app-panes-scroll">{pane}</SheetBody>
          ) : (
            <>
              {header}
              <SheetBody className="app-panes-scroll">
                <Sheet plain as="div" label={view} turnKey={view} turnDir={dir}>
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
              <Sheet plain as="div" label={view} turnKey={view} turnDir={dir}>
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
