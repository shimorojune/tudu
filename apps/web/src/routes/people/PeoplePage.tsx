import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  dueLabel,
  findPeople,
  groupShared,
  mondayOf,
  nobodyWords,
  peopleCount,
  personDays,
  sharedTotal,
  sharedWords,
  weekDays,
  type PeopleGroup,
  type PeopleRange,
  type Person,
  type PersonTasks,
  type Project,
  type Task,
  type TaskRefResponse,
} from '@tudu/core';
import {
  Banner,
  Button,
  DayHeader,
  EmptyState,
  FilterField,
  Icon,
  MemberList,
  PersonHeader,
  PersonRow,
  Segmented,
  Sheet,
  SheetBody,
  TaskLine,
  TaskListSkeleton,
  type SharedTask,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { openMembers } from '../../app/dayView';
import { api, meQuery } from '../../app/session';
import { spacePath, useSpace } from '../../app/space';
import { taskStore, useOnline } from '../../app/tasks';
import { useViewport, type Viewport } from '../../app/viewport';
import { useWorkingDay } from '../../app/workingDay';
import { TaskPanel, type OpenTask } from '../today/TaskPanel';
import './people.css';

const MIN_HEIGHT: Record<Viewport, number> = { desktop: 560, tablet: 640, phone: 520 };
const RANGES: Array<{ value: PeopleRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
];
const GROUPS: Array<{ value: PeopleGroup; label: string }> = [
  { value: 'day', label: 'By day' },
  { value: 'person', label: 'By person' },
];

/** A shared task as a read-only line. */
export function toLine(t: Task, today: string, projects: Project[]): SharedTask {
  const project = t.projectId ? projects.find((p) => p.id === t.projectId) : undefined;
  return {
    key: t.id,
    title: t.title,
    done: t.done,
    due:
      t.due && !t.done
        ? {
            label: `${dueLabel(t.due, today).overdue ? 'Overdue since' : 'Due'} ${dueLabel(t.due, today).label}`,
            overdue: dueLabel(t.due, today).overdue,
          }
        : null,
    project: project ? { name: project.name, color: project.color } : null,
  };
}

/**
 * People, team spaces only. One page like mail: on the left "People · 19 in Northwind", Find someone, Everyone and
 * every member with how many tasks they share this week; on the right Everyone's shared tasks (Today | This week,
 * By day | By person) or one person's week day by day. Picking only turns the right side; phones push the person in.
 */
export function PeoplePage() {
  const vp = useViewport();
  const me = useQuery(meQuery).data;
  const space = useSpace();
  const { today } = useWorkingDay();
  const online = useOnline();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { userId?: string };
  const picked = params.userId ?? null;
  const monday = mondayOf(today);
  const sunday = weekDays(monday)[6]!;
  const q = useQuery(taskStore.peopleQuery(space.id, monday, sunday));
  const projects = useQuery(taskStore.projectsQuery(space.id)).data ?? [];
  const [find, setFind] = useState('');
  const [range, setRange] = useState<PeopleRange>('week');
  const [group, setGroup] = useState<PeopleGroup>('day');
  const here = spacePath(space.slug, 'people');

  // The open task: in the address as its ref, so a reload and a link reopen it.
  const search = useSearch({ strict: false }) as { task?: string };
  const [open, setOpen] = useState<OpenTask | null>(null);
  const resolving = useRef<string | null>(null);
  const closed = useRef<string | null>(null);
  const pathFor = (userId: string | null, ref?: string | null) =>
    `${userId ? `${here}/${userId}` : here}${ref ? `?task=${encodeURIComponent(ref)}` : ''}`;
  useEffect(() => {
    const ref = search.task;
    if (!ref || open || resolving.current === ref || closed.current === ref) return;
    resolving.current = ref;
    void api.get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(ref)}`).then(
      (r) => setOpen({ id: r.taskId, dir: 'next' }),
      () => {
        resolving.current = null;
        void navigate({ href: pathFor(picked), replace: true });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathFor is derived from picked and here
  }, [search.task, open, navigate, picked, here]);
  const openTask = (t: Task) => {
    setOpen({ id: t.id, dir: 'next' });
    closed.current = null;
    if (t.ref) resolving.current = t.ref;
    void navigate({ href: pathFor(picked, t.ref), replace: true });
  };
  const closeTask = () => {
    setOpen(null);
    closed.current = search.task ?? null;
    resolving.current = null;
    if (search.task) void navigate({ href: pathFor(picked), replace: true });
  };

  const members = q.data?.members ?? [];
  const person = picked ? members.find((m) => m.id === picked) : undefined;
  const pick = (p: { id: string } | null) => void navigate({ href: pathFor(p?.id ?? null) });
  const compact = vp === 'phone';
  if (!me) return null;

  const list = (
    <PeopleList
      space={space.name}
      members={members}
      pending={q.isPending}
      active={picked}
      find={find}
      onFind={setFind}
      onPick={pick}
      compact={compact}
    />
  );
  const pane = person ? (
    <PersonPane
      person={person}
      today={today}
      monday={monday}
      sunday={sunday}
      projects={projects}
      onOpenTask={openTask}
      compact={compact}
      onBack={compact ? () => pick(null) : undefined}
    />
  ) : (
    <EveryonePane
      members={members}
      pending={q.isPending}
      error={q.isError && !q.data}
      retry={() => void q.refetch()}
      fetching={q.isFetching}
      today={today}
      projects={projects}
      range={range}
      onRange={setRange}
      group={group}
      onGroup={setGroup}
      onOpenTask={openTask}
      onOpenPerson={(p) => pick(p)}
      compact={compact}
    />
  );
  const panel = (
    <TaskPanel
      spaceId={space.id}
      open={open}
      today={today}
      vp={vp}
      me={{ id: me.user.id, name: me.user.name, email: me.user.email }}
      onClose={closeTask}
      onStep={() => {}}
      linkFor={(ref) => `${window.location.origin}/t/${ref}`}
      backFor={() => 'People'}
    />
  );

  if (compact)
    return (
      <div className="app-page app-people app-people-phone">
        {!online ? (
          <Banner tone="warning" title="You’re offline.">
            What you see is what was last loaded.
          </Banner>
        ) : null}
        <Sheet
          label="People"
          fill
          minHeight={MIN_HEIGHT[vp]}
          turnKey={picked ?? 'list'}
          turnDir={picked ? 'next' : 'prev'}
        >
          {person ? pane : list}
        </Sheet>
        {panel}
      </div>
    );
  return (
    <div className="app-page app-people">
      {!online ? (
        <Banner tone="warning" title="You’re offline.">
          What you see is what was last loaded.
        </Banner>
      ) : null}
      <Sheet label="People" fill minHeight={MIN_HEIGHT[vp]}>
        <div className="app-panes">
          <div className="app-panes-l">{list}</div>
          <div className="app-panes-r">
            <Sheet
              plain
              as="div"
              label={person ? person.name : 'Everyone'}
              turnKey={picked ?? '_all'}
              turnDir={picked ? 'next' : 'prev'}
              className="app-panes-turn"
            >
              {pane}
            </Sheet>
          </div>
        </div>
      </Sheet>
      {panel}
    </div>
  );
}

function PeopleList(p: {
  space: string;
  members: PersonTasks[];
  pending: boolean;
  active: string | null;
  find: string;
  onFind: (q: string) => void;
  onPick: (person: { id: string } | null) => void;
  compact: boolean;
}) {
  const shown = findPeople(p.members, p.find);
  const total = p.members.reduce((n, m) => n + m.count, 0);
  const searching = !!p.find.trim();
  return (
    <>
      <DayHeader
        day="People"
        date={p.pending ? '' : peopleCount(p.members.length, p.space)}
        nav={false}
        compact
      >
        <FilterField value={p.find} onChange={p.onFind} placeholder="Find someone" />
        <Button variant="secondary" size="sm" icon={<Icon name="plus" size={14} />} onClick={openMembers}>
          Invite people
        </Button>
      </DayHeader>
      <SheetBody className="app-panes-scroll">
        {p.pending ? (
          <TaskListSkeleton rows={4} compact />
        ) : (
          <MemberList
            people={shown.map((m) => ({
              id: m.id,
              name: m.name || m.email,
              email: m.email,
              initials: m.initials,
              color: m.color ?? undefined,
              you: m.you,
              count: m.count,
            }))}
            active={p.active}
            allLabel={searching ? undefined : 'Everyone'}
            allSub={sharedWords(total)}
            onPick={p.onPick}
            empty={searching ? nobodyWords(p.find, p.space) : undefined}
          />
        )}
      </SheetBody>
    </>
  );
}

function EveryonePane(p: {
  members: PersonTasks[];
  pending: boolean;
  error: boolean;
  fetching: boolean;
  retry: () => void;
  today: string;
  projects: Project[];
  range: PeopleRange;
  onRange: (r: PeopleRange) => void;
  group: PeopleGroup;
  onGroup: (g: PeopleGroup) => void;
  onOpenTask: (t: Task) => void;
  onOpenPerson: (p: Person) => void;
  compact: boolean;
}) {
  const groups = groupShared(p.members, p.group, p.range, p.today);
  const total = sharedTotal(groups);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const turn = (g: PeopleGroup) => {
    setDir(g === 'person' ? 'next' : 'prev');
    p.onGroup(g);
  };
  let body;
  if (p.pending) body = <TaskListSkeleton rows={4} compact />;
  else if (p.error)
    body = (
      <EmptyState
        tone="error"
        title="Couldn’t load People."
        action="Try again"
        loading={p.fetching}
        loadingLabel="Trying again"
        onAction={p.retry}
      >
        Check your connection.
      </EmptyState>
    );
  else if (!total)
    body = (
      <EmptyState
        title={p.range === 'today' ? 'Nothing shared today.' : 'Nothing shared this week.'}
        mark={false}
      >
        Tasks people write in this space show up here, unless they are marked Only me.
      </EmptyState>
    );
  else if (p.group === 'person')
    body = p.members
      .filter((m) => groups.some((g) => g.key === m.id))
      .map((m) => {
        const tasks = groups
          .find((g) => g.key === m.id)!
          .items.map((i) => toLine(i.task, p.today, p.projects));
        return (
          <PersonRow
            key={m.id}
            person={{
              name: m.name || m.email,
              email: m.email,
              initials: m.initials,
              color: m.color ?? undefined,
              you: m.you,
            }}
            tasks={tasks}
            onOpen={() => p.onOpenPerson(m)}
            onOpenTask={(line) => {
              const t = m.tasks.find((x) => x.id === line.key);
              if (t) p.onOpenTask(t);
            }}
          />
        );
      });
  else
    body = groups.map((g) => (
      <section key={g.key} className="app-shared-group" aria-label={g.title}>
        <div className="app-shared-title tp-turnable">{g.title}</div>
        <div className="app-shared-list">
          {g.items.map((i) => (
            <TaskLine
              key={i.task.id}
              task={toLine(i.task, p.today, p.projects)}
              who={{
                name: i.who.name || i.who.email,
                initials: i.who.initials,
                color: i.who.color ?? undefined,
              }}
              onOpen={() => p.onOpenTask(i.task)}
            />
          ))}
        </div>
      </section>
    ));
  return (
    <>
      <DayHeader
        day="Everyone"
        date={p.pending ? '' : sharedWords(sharedTotal(groupShared(p.members, 'day', 'week', p.today)))}
        nav={false}
        compact={p.compact}
      >
        <Segmented items={RANGES} value={p.range} onChange={p.onRange} label="Range" />
        <Segmented items={GROUPS} value={p.group} onChange={turn} label="Group by" />
      </DayHeader>
      <SheetBody className="app-panes-scroll">
        <Sheet plain as="section" label="Shared" turnKey={`${p.group}:${p.range}`} turnDir={dir}>
          {body}
        </Sheet>
      </SheetBody>
    </>
  );
}

function PersonPane(p: {
  person: PersonTasks;
  today: string;
  monday: string;
  sunday: string;
  projects: Project[];
  onOpenTask: (t: Task) => void;
  compact: boolean;
  onBack?: () => void;
}) {
  const w = p.person;
  const days = personDays(w.tasks, p.monday, p.sunday, p.today);
  return (
    <>
      {p.onBack ? (
        <div className="app-people-back">
          <button type="button" className="tp-td-back" onClick={p.onBack}>
            <Icon name="left" size={18} />
            <span>People</span>
          </button>
        </div>
      ) : null}
      <PersonHeader
        person={{
          name: w.name || w.email,
          email: w.email,
          initials: w.initials,
          color: w.color ?? undefined,
        }}
        sub={w.you ? `${w.email} · you` : w.email}
        compact={p.compact}
      />
      <SheetBody className="app-panes-scroll">
        {days.map((d) => (
          <section key={d.day} className="app-shared-group" aria-label={d.title}>
            <div className="app-shared-title tp-turnable">{d.title}</div>
            {d.tasks.length ? (
              <div className="app-shared-list">
                {d.tasks.map((t) => (
                  <TaskLine key={t.id} task={toLine(t, p.today, p.projects)} onOpen={() => p.onOpenTask(t)} />
                ))}
              </div>
            ) : (
              <div className="app-shared-none tp-turnable">Nothing shared</div>
            )}
          </section>
        ))}
      </SheetBody>
    </>
  );
}
