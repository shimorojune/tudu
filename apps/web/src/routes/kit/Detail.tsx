import { TaskDetail, type TaskDetailTask } from '@tudu/ui';
import { useState } from 'react';
import { Pair, Section } from './Pair';

const TODAY = '2026-10-18';

const NOTES_RICH =
  '<p>Meera wants a <strong>yes or no by Monday morning</strong>. Focus on:</p><ul><li>The global shortcut on macOS and Windows</li><li>Where new tasks land: <code>Backlog</code> vs <code>Today</code></li></ul>' +
  '<ul class="tp-checks" data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked disabled><span></span></label><div><p>Pull the branch</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox" disabled><span></span></label><div><p>Run it on a clean profile</p></div></li></ul>' +
  '<p>Spec: <a href="https://example.com/quick-add-spec.md">quick-add-spec.md</a></p>';

const MI = { who: 'Meera Iyer', initials: 'MI', color: '#3d5a80' };
const RR = { who: 'Rohit Raj', initials: 'RR' };

const STATES: Array<{ title: string; note: string; task: TaskDetailTask }> = [
  {
    title: 'A full task',
    note: 'Notes, subtasks, history and comments, as on the states board.',
    task: {
      key: 'full',
      id: 'ME-52',
      title: 'Review Quick Add PR and leave comments before Meera’s demo on Monday',
      done: false,
      day: TODAY,
      due: '2026-10-16',
      visibility: 'space',
      notes: NOTES_RICH,
      subtasks: [
        { key: 'a', title: 'Test global shortcut on macOS', done: true },
        { key: 'b', title: 'Check Backlog vs Today destination', done: true },
        { key: 'c', title: 'Leave review comments', done: false },
        { key: 'd', title: 'Approve or request changes', done: false },
      ],
      comments: [
        {
          key: 'c1',
          ...MI,
          when: 'Thu 10:12',
          html: '<p>PR is up. The shortcut works on <b>Windows</b> too, so test both if you can.</p><ul><li>Branch: <code>feat/quick-add</code></li></ul>',
          mine: false,
        },
        { key: 'c2', ...RR, when: 'Thu 16:40', html: '<p>Will review tomorrow morning.</p>', mine: true },
        {
          key: 'c3',
          ...MI,
          when: 'Fri 09:05',
          html: '<p>Thanks! Demo moved to Monday 10:30.</p>',
          mine: false,
        },
      ],
      history: [
        { key: 1, text: 'Created', when: 'Wed' },
        { key: 2, text: 'Due date set to Fri 16 Oct', when: 'Thu' },
      ],
    },
  },
  {
    title: 'Just written',
    note: 'Every empty fact invites you in.',
    task: {
      key: 'fresh',
      id: 'ME-90',
      title: 'Order a new desk lamp',
      done: false,
      day: TODAY,
      due: null,
      visibility: 'space',
      notes: '',
      subtasks: [],
      comments: [],
      history: [{ key: 1, text: 'Created', when: 'Just now' }],
    },
  },
  {
    title: 'Crossed off',
    note: 'Struck through, all quiet.',
    task: {
      key: 'done',
      id: 'ME-44',
      title: 'Book flights for the offsite',
      done: true,
      day: TODAY,
      due: null,
      visibility: 'space',
      notes: 'Booked: Sun 25 Oct, 07:10 out, Wed 28 Oct, 19:40 back. Receipts are in the Northwind folder.',
      subtasks: [
        { key: 'a', title: 'Check dates with the team', done: true },
        { key: 'b', title: 'Book flights', done: true },
        { key: 'c', title: 'Send the itinerary', done: true },
      ],
      comments: [
        { key: 'c1', ...MI, when: 'Tue 12:30', html: '<p>Dates work for everyone.</p>', mine: false },
      ],
      history: [
        { key: 1, text: 'Created', when: 'Mon' },
        { key: 2, text: 'Crossed off', when: 'Sat' },
      ],
    },
  },
  {
    title: 'Slipping',
    note: 'Carried four times, overdue.',
    task: {
      key: 'slip',
      id: 'ME-81',
      title: 'Reply to legal about the data processing addendum',
      done: false,
      day: TODAY,
      carried: { label: 'Wed', slipping: true },
      due: '2026-10-14',
      visibility: 'space',
      notes: 'They need our sub-processor list and the hosting region. Ask Arjun for the latest list.',
      subtasks: [],
      comments: [],
      history: [
        { key: 1, text: 'Created', when: 'Tue' },
        { key: 2, text: 'Carried over from Wed 14 Oct', when: 'Thu' },
        { key: 3, text: 'Carried over from Thu 15 Oct', when: 'Fri' },
        { key: 4, text: 'Carried over from Sat 17 Oct', when: 'Sun' },
      ],
    },
  },
];

/** The panel with its task kept here, so every control works on the kit page. */
function KitTask({ initial }: { initial: TaskDetailTask }) {
  const [task, setTask] = useState(initial);
  let n = 0;
  const patch = (p: Partial<TaskDetailTask>) => setTask((t) => ({ ...t, ...p }));
  return (
    <div className="kit-td">
      <TaskDetail
        task={task}
        today={TODAY}
        me={{ initials: 'RR', name: 'Rohit Raj' }}
        visibility={[{ value: 'space', label: 'Only you' }]}
        calendar={{ marks: { '2026-10-19': 3, '2026-10-21': 1 } }}
        link={`https://tudu.test/t/${task.id}`}
        onClose={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onRename={(title) => patch({ title })}
        onCross={(done) => patch({ done })}
        onMove={(day) => patch({ day, carried: undefined })}
        onDue={(due) => patch({ due })}
        onVisibility={(visibility) => patch({ visibility })}
        onNotes={(notes) => patch({ notes })}
        onAddSubtask={(title) =>
          setTask((t) => ({
            ...t,
            subtasks: [...t.subtasks, { key: `n${n++}${title}`, title, done: false }],
          }))
        }
        onRenameSubtask={(s, title) =>
          setTask((t) => ({ ...t, subtasks: t.subtasks.map((x) => (x.key === s.key ? { ...x, title } : x)) }))
        }
        onToggleSubtask={(s, done) =>
          setTask((t) => ({ ...t, subtasks: t.subtasks.map((x) => (x.key === s.key ? { ...x, done } : x)) }))
        }
        onReorderSubtask={(s, from, to) =>
          setTask((t) => {
            const out = [...t.subtasks];
            out.splice(from, 1);
            out.splice(to, 0, s);
            return { ...t, subtasks: out };
          })
        }
        onDeleteSubtask={(s) =>
          setTask((t) => ({ ...t, subtasks: t.subtasks.filter((x) => x.key !== s.key) }))
        }
        onRestoreSubtask={(s, i) =>
          setTask((t) => {
            const out = [...t.subtasks];
            out.splice(i, 0, s);
            return { ...t, subtasks: out };
          })
        }
        onAddComment={(html) => {
          const key = `c${Date.now()}`;
          setTask((t) => ({
            ...t,
            comments: [...t.comments, { key, ...RR, when: 'Just now', html, mine: true }],
          }));
          return key;
        }}
        onEditComment={(c, html) =>
          setTask((t) => ({
            ...t,
            comments: t.comments.map((x) => (x.key === c.key ? { ...x, html, edited: true } : x)),
          }))
        }
        onDeleteComment={(c) =>
          setTask((t) => ({ ...t, comments: t.comments.filter((x) => x.key !== c.key) }))
        }
        onRestoreComment={(c) => setTask((t) => ({ ...t, comments: [...t.comments, c] }))}
        onDelete={() => {}}
      />
    </div>
  );
}

/** The task panel in its four states, light and dark. Every control works. */
export function Detail() {
  return (
    <Section
      id="detail"
      title="Task detail"
      lead="One calm column: the facts, Notes, Subtasks, History and Comments, written in place. Chunk 03."
    >
      {STATES.map((s) => (
        <Pair key={s.title} title={s.title} note={s.note} render={() => <KitTask initial={s.task} />} />
      ))}
    </Section>
  );
}
