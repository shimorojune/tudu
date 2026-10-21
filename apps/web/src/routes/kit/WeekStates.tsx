import {
  DayHeader,
  EmptyState,
  Sheet,
  TaskList,
  TaskListSkeleton,
  WeekDay,
  WeekPicker,
  WeekTiles,
  type TaskItem,
} from '@tudu/ui';
import { useState } from 'react';
import { Pair, Section } from './Pair';

const TODAY = '2026-10-18';
const NW = { name: 'Northwind', color: '#3d5a80' };
const PF = { name: 'Platform', color: '#5b7553' };
const HM = { name: 'Home', color: '#8a5a00' };

const SUNDAY: TaskItem[] = [
  { key: 'a', title: 'Pay the electricity bill', project: HM },
  {
    key: 'b',
    title: 'Review Quick Add PR and leave comments before Meera’s demo on Monday',
    due: { label: 'Fri', overdue: true, tip: 'Was due Friday 16 October' },
    jira: 'TUDU-212',
    project: NW,
  },
  {
    key: 'c',
    title: 'Run the request status enum migration and backfill on staging',
    jira: 'TUDU-219',
    project: PF,
  },
  {
    key: 'd',
    title: 'Sync with Meera on onboarding copy',
    carried: { label: 'Sat', tip: 'Carried over from Saturday' },
    project: NW,
  },
  { key: 'e', title: 'Write up what we learned from the onboarding interviews', project: NW },
  { key: 'f', title: 'Book flights for the offsite', project: NW, done: true },
  { key: 'g', title: 'Renew the domain', done: true },
];
const MONDAY: TaskItem[] = [
  {
    key: 'h',
    title: 'Meera’s Quick Add demo',
    due: { label: '10:30', tip: 'Monday 19 October, 10:30' },
    project: NW,
  },
  { key: 'i', title: 'Run the request status enum migration on production', jira: 'TUDU-220', project: PF },
  { key: 'j', title: 'Call the bank about the card' },
];
const FULL: TaskItem[] = [
  'Reply to Meera about the copy',
  'Check the staging alerts',
  'Review the hiring loop notes',
  'Order the offsite T-shirts',
  'Send the invoice to Northwind',
  'Update the Q4 roadmap doc',
  'Book the meeting room for Thursday',
  'Read the security review',
  'Call the landlord',
  'Prepare the sprint demo',
  'Pick up the parcel',
  'Answer the design survey',
].map((title, i) => ({ key: `f${i}`, title, project: i % 3 === 0 ? NW : i % 3 === 1 ? PF : undefined }));
const DONE: TaskItem[] = [
  { key: 'k', title: 'Send the September invoice', project: HM, done: true },
  { key: 'l', title: 'Draft agenda for the Northwind planning session', project: NW, done: true },
  { key: 'm', title: 'Water the plants', done: true },
];
const BACKLOG: TaskItem[] = [
  { key: 'n', title: 'Clean up the old staging buckets', project: PF, jira: 'TUDU-198' },
  { key: 'o', title: 'Renew passport' },
  { key: 'p', title: 'Draft the Q4 hiring plan', project: NW },
];
const MARKS = { '2026-10-18': 7, '2026-10-19': 3, '2026-10-20': 1, '2026-10-22': 2, '2026-10-23': 1 };

function list(tasks: TaskItem[], label: string, undated?: boolean) {
  return (
    <TaskList
      tasks={tasks}
      label={label}
      brief
      compact
      undated={undated}
      planButton={undated}
      calendar={{ today: TODAY, marks: MARKS }}
    />
  );
}

const TILE = { height: 420, flex: '0 0 300px' };

function Tiles() {
  return (
    <WeekTiles className="kit-week-tiles">
      <WeekDay variant="tile" day="Sunday" date="18 Oct" eyebrow="Today" today count="2 of 7" style={TILE}>
        {list(SUNDAY, 'Sunday')}
      </WeekDay>
      <WeekDay variant="tile" day="Saturday" date="24 Oct" eyebrow="In 6 days" empty style={TILE}>
        {list([], 'Saturday')}
      </WeekDay>
      <WeekDay variant="tile" day="Monday" date="19 Oct" eyebrow="Tomorrow" count="12 tasks" style={TILE}>
        {list(FULL, 'Monday')}
      </WeekDay>
      <WeekDay
        variant="tile"
        day="Saturday"
        date="17 Oct"
        eyebrow="Yesterday"
        past
        count="3 of 3"
        style={TILE}
      >
        {list(DONE, 'Saturday')}
      </WeekDay>
      <WeekDay variant="tile" day="Tuesday" date="20 Oct" eyebrow="In 2 days" style={TILE}>
        <TaskListSkeleton rows={3} compact />
      </WeekDay>
      <WeekDay
        variant="tile"
        quiet
        day="Backlog"
        eyebrow="No date"
        empty
        emptyText="Nothing waiting"
        style={TILE}
      />
    </WeekTiles>
  );
}

function Sections() {
  const [open, setOpen] = useState<Record<string, boolean>>({ mon: true });
  const toggle = (k: string) => (v: boolean) => setOpen((o) => ({ ...o, [k]: v }));
  return (
    <Sheet label="Days that fold" style={{ width: '100%', maxWidth: 390 }}>
      <WeekDay
        day="Sunday"
        date="18 Oct"
        eyebrow="Today"
        today
        count="2 of 7"
        preview="Pay the electricity bill · Review Quick Add PR and leave comments before Meera’s demo on Monday"
        open={!!open.sun}
        onToggle={toggle('sun')}
      >
        {list(SUNDAY, 'Sunday, folding')}
      </WeekDay>
      <WeekDay
        day="Monday"
        date="19 Oct"
        eyebrow="Tomorrow"
        count="3 tasks"
        preview="Meera’s Quick Add demo · Run the request status enum migration on production · Call the bank about the card"
        open={!!open.mon}
        onToggle={toggle('mon')}
      >
        {list(MONDAY, 'Monday, folding')}
      </WeekDay>
      <WeekDay day="Saturday" date="24 Oct" empty open={!!open.sat} onToggle={toggle('sat')}>
        {list([], 'Saturday, folding')}
      </WeekDay>
      <WeekDay
        day="Saturday"
        date="17 Oct"
        count="3 of 3"
        preview="All crossed off"
        open={!!open.done}
        onToggle={toggle('done')}
      >
        {list(DONE, 'Saturday gone by, folding')}
      </WeekDay>
      <WeekDay day="Tuesday" date="20 Oct" open={!!open.tue} onToggle={toggle('tue')}>
        <TaskListSkeleton rows={3} compact />
      </WeekDay>
      <WeekDay
        quiet
        day="Backlog"
        count="3 tasks"
        preview="Clean up the old staging buckets · Renew passport · Draft the Q4 hiring plan"
        open={!!open.b}
        onToggle={toggle('b')}
      >
        {list(BACKLOG, 'Backlog, folding', true)}
      </WeekDay>
    </Sheet>
  );
}

function Header() {
  const [monday, setMonday] = useState('2026-10-12');
  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <DayHeader
        eyebrow="This week · Week 42"
        day="12 – 18"
        date="October"
        done={2}
        total={9}
        isToday={monday === '2026-10-12'}
        onPrev={() => {}}
        onNext={() => {}}
        onToday={() => setMonday('2026-10-12')}
        weeks={{ today: TODAY, selected: monday, marks: MARKS, onPick: setMonday }}
        prevLabel="Previous week"
        nextLabel="Next week"
        todayLabel="Back to this week"
        pickLabel="Pick a week"
        doneNote="That’s the week"
        bare
      />
    </div>
  );
}

/** The week's tiles, the days that fold, the header with its picker, and the week that would not load. */
export function WeekStates() {
  return (
    <Section
      title="The week"
      id="week"
      lead="Each day is a small sheet on the desk; on tablets and phones the days fold. The header picks a week."
    >
      <Pair
        title="Tiles"
        note="Today, nothing planned, a very full day, all crossed off, loading, the Backlog empty."
        render={() => <Tiles />}
      />
      <Pair
        title="Days that fold"
        note="Tap a header: the chevron turns and the list folds open by its real height."
        render={() => <Sections />}
      />
      <Pair
        title="The header and the week picker"
        note="Bare, as on the desk: the arrows on the title line, the ring, That’s the week."
        render={() => <Header />}
      />
      <Pair
        title="The picker alone"
        note="A month of weeks: numbers, days, dots, this week marked, the hint under the pointer."
        render={() => <WeekPicker today={TODAY} selected="2026-10-12" marks={MARKS} />}
      />
      <Pair
        title="The week could not load"
        note="In place of the tiles. Offline, the week still shows what it last loaded."
        render={() => (
          <Sheet
            label="Week"
            style={{
              width: '100%',
              maxWidth: 616,
              height: 320,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <EmptyState tone="error" title="Couldn’t load this week." action="Try again">
              Check your connection. Anything you already see stays as it is.
            </EmptyState>
          </Sheet>
        )}
      />
    </Section>
  );
}
