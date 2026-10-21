import {
  DayHeader,
  EmptyState,
  ProjectFilter,
  Segmented,
  Sheet,
  SheetBody,
  TaskList,
  TaskListSkeleton,
  type TaskItem,
} from '@tudu/ui';
import type { BacklogView } from '@tudu/core';
import { useState, type ReactNode } from 'react';
import { Pair, Section } from './Pair';

const TODAY = '2026-10-18';
const NW = { name: 'Northwind', color: '#3d5a80' };
const PF = { name: 'Platform', color: '#5b7553' };
const HM = { name: 'Home', color: '#8a5a00' };
const PROJECTS = [
  { id: 'nw', ...NW, count: 2 },
  { id: 'pf', ...PF, count: 2 },
  { id: 'hm', ...HM, count: 0 },
];
const ROWS: TaskItem[] = [
  {
    key: 'a',
    id: 'ME-24',
    title: 'Clean up the old staging buckets',
    project: PF,
    jira: 'TUDU-198',
    comments: 2,
  },
  {
    key: 'b',
    id: 'ME-72',
    title: 'Prepare the Q4 OKR draft for the Northwind leads',
    project: NW,
    due: { label: 'Fri 6 Nov' },
  },
  {
    key: 'c',
    id: 'ME-26',
    title: 'Draft the Q4 hiring plan',
    project: NW,
    comments: 1,
    subtasks: [
      { key: 'c1', title: 'Ask Arjun for the headcount', done: true },
      { key: 'c2', title: 'Rough budget', done: false },
      { key: 'c3', title: 'Share with Meera', done: false },
    ],
  },
  { key: 'd', id: 'ME-27', title: 'Fix the flaky date-picker test', project: PF, jira: 'TUDU-233' },
];
const LONG: TaskItem[] = [
  'Write the onboarding email sequence for new spaces',
  'Book the car service',
  'Read the RFC on offline sync and leave comments',
  'Compare standing desks',
  'Plan the team dinner after the offsite',
  'Archive the old project channels',
  'Call the insurance about the claim',
  'Renew passport',
  'Sort out the photo backup',
  'Write the 2.5 release plan',
  'Update the security questionnaire',
  'Clean up the shared drive',
].map((title, i) => ({
  key: `l${i}`,
  id: `ME-${80 + i}`,
  title,
  project: i % 3 === 0 ? NW : i % 3 === 1 ? PF : HM,
}));
const DONE: TaskItem[] = [
  { key: 'x', id: 'ME-19', title: 'Order the new keyboard', project: HM, done: true },
  { key: 'y', id: 'ME-12', title: 'Cancel the old hosting plan', project: PF, done: true },
];
const VIEWS: Array<{ value: BacklogView; label: string }> = [
  { value: 'open', label: 'To do' },
  { value: 'done', label: 'Crossed off' },
];

function BacklogSheet({
  count,
  filter,
  view = 'open',
  onView,
  children,
}: {
  count: string;
  filter?: string | null;
  view?: BacklogView;
  onView?: (v: BacklogView) => void;
  children: ReactNode;
}) {
  const [f, setF] = useState<string | null>(filter ?? null);
  return (
    <Sheet label="Backlog" fill style={{ width: 440, height: 560 }}>
      <DayHeader day="Backlog" date={count} nav={false} compact>
        <ProjectFilter projects={PROJECTS} total={4} value={f} onChange={setF} />
        <Segmented items={VIEWS} value={view} onChange={onView} label="View" />
      </DayHeader>
      <SheetBody>{children}</SheetBody>
    </Sheet>
  );
}

/** A working Backlog: cross one off and it folds away after a beat with Undo; the calendar button gives a day. */
function Working() {
  const [tasks, setTasks] = useState(ROWS);
  const [done, setDone] = useState(DONE);
  const [view, setView] = useState<BacklogView>('open');
  const dir = view === 'done' ? 'next' : 'prev';
  return (
    <BacklogSheet
      count={view === 'open' ? `${tasks.length} tasks` : `${done.length} crossed off`}
      view={view}
      onView={setView}
    >
      <Sheet plain as="div" label={view === 'open' ? 'To do' : 'Crossed off'} turnKey={view} turnDir={dir}>
        {view === 'open' ? (
          <TaskList
            tasks={tasks}
            label="A working Backlog"
            compact
            undated
            planButton
            leaveDone
            calendar={{ today: TODAY, marks: {} }}
            addLabel="Add to the Backlog…"
            onAdd={(text) => {
              const key = `n${Date.now()}`;
              setTasks((l) => [...l, { key, title: text }]);
              return key;
            }}
            onReorder={(next) => setTasks(next)}
            onLeave={(t) => {
              setTasks((l) => l.filter((x) => x.key !== t.key));
              setDone((l) => [{ ...t, done: true }, ...l]);
            }}
            onUnleave={(t, _d, at) => {
              setDone((l) => l.filter((x) => x.key !== t.key));
              setTasks((l) => {
                const n = l.filter((x) => x.key !== t.key);
                n.splice(Math.min(at, n.length), 0, { ...t, done: false });
                return n;
              });
            }}
            onMoveTask={(t, to, _from, at) => {
              if (to === null)
                setTasks((l) => {
                  const n = l.filter((x) => x.key !== t.key);
                  n.splice(Math.min(at ?? n.length, n.length), 0, t);
                  return n;
                });
              else setTasks((l) => l.filter((x) => x.key !== t.key));
            }}
          />
        ) : (
          <TaskList
            tasks={done}
            label="Crossed off in a working Backlog"
            compact
            static
            leaveUndone
            unleaveToast="Back in the Backlog"
            onLeave={(t) => {
              setDone((l) => l.filter((x) => x.key !== t.key));
              setTasks((l) => [...l, { ...t, done: false }]);
            }}
            onUnleave={(t, _d, at) => {
              setTasks((l) => l.filter((x) => x.key !== t.key));
              setDone((l) => {
                const n = l.filter((x) => x.key !== t.key);
                n.splice(Math.min(at, n.length), 0, { ...t, done: true });
                return n;
              });
            }}
          />
        )}
      </Sheet>
    </BacklogSheet>
  );
}

/** The Backlog's states: working, long, filtered, nothing for the project, empty, loading, failed. */
export function BacklogStates() {
  return (
    <Section
      title="The Backlog"
      id="backlog"
      lead="One sheet like Today for the tasks with no day. The calendar button at a row’s end gives it a day; crossing one off folds it away to Crossed off."
    >
      <Pair
        title="A working list"
        note="The same rows as Today. Cross one off: the tick and sparkle play, the row waits a beat, then folds away; Undo puts it back. Turn to Crossed off and untick one to send it back."
        render={() => <Working />}
      />
      <Pair
        title="Long"
        note="Only the list scrolls; the header and the filter stay."
        render={() => (
          <BacklogSheet count="12 tasks">
            <TaskList
              tasks={LONG}
              label="A long Backlog"
              compact
              undated
              planButton
              calendar={{ today: TODAY, marks: {} }}
              addLabel="Add to the Backlog…"
            />
          </BacklogSheet>
        )}
      />
      <Pair
        title="Filtered"
        note="The chip shows the project with its dot; the count says what’s showing."
        render={() => (
          <BacklogSheet count="2 tasks in Platform" filter="pf">
            <TaskList
              tasks={ROWS}
              label="A filtered Backlog"
              compact
              undated
              planButton
              calendar={{ today: TODAY, marks: {} }}
              filter="Platform"
            />
          </BacklogSheet>
        )}
      />
      <Pair
        title="Nothing for this project"
        render={() => (
          <BacklogSheet count="0 tasks in Home" filter="hm">
            <EmptyState title="Nothing here for this project." action="Show all projects" plain mark={false}>
              The rest of the Backlog is one click away.
            </EmptyState>
          </BacklogSheet>
        )}
      />
      <Pair
        title="Empty"
        render={() => (
          <BacklogSheet count="Nothing waiting">
            <EmptyState title="Nothing waiting." action="Add a task">
              Tasks without a day land here. Give one a day with its calendar button when you’re ready.
            </EmptyState>
          </BacklogSheet>
        )}
      />
      <Pair
        title="Loading"
        note="Skeleton rows, never a spinner."
        render={() => (
          <BacklogSheet count="">
            <TaskListSkeleton rows={5} compact />
          </BacklogSheet>
        )}
      />
      <Pair
        title="Couldn’t load"
        render={() => (
          <BacklogSheet count="">
            <EmptyState tone="error" title="Couldn’t load the Backlog." action="Try again">
              Check your connection. Offline, the Backlog shows what was last loaded.
            </EmptyState>
          </BacklogSheet>
        )}
      />
    </Section>
  );
}
