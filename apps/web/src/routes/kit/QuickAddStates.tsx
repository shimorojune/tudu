import { QuickAdd, type QuickAddProps } from '@tudu/ui';
import { Pair, Section } from './Pair';

const TODAY = '2026-10-18';
const PROJECTS = [
  { id: 'nw', name: 'Northwind', color: '#3d5a80' },
  { id: 'pf', name: 'Platform', color: '#5b7553' },
  { id: 'hm', name: 'Home', color: '#8a5a00' },
];

const STATES: Array<{ title: string; note: string; initial: QuickAddProps['initial'] }> = [
  { title: 'Just opened', note: 'One line, three quiet chips.', initial: { noFocus: true } },
  {
    title: 'Written',
    note: 'Tomorrow, due Thursday, a project.',
    initial: {
      noFocus: true,
      title: 'Review Arjun’s design for the Jira panel empty states',
      planned: '2026-10-19',
      due: '2026-10-22',
      projectId: 'pf',
    },
  },
  {
    title: 'With a note and two files',
    note: 'The note line and file chips fade up only when asked for.',
    initial: {
      noFocus: true,
      title: 'Send the offsite agenda to the team',
      projectId: 'nw',
      note: 'Keep it to one page.\nAsk Meera for the venue address.',
      files: [
        { key: 'a', id: 'a', name: 'offsite-agenda-v3.pdf', size: 248_000, progress: 1 },
        { key: 'b', id: 'b', name: 'venue-map.png', size: 1_260_000, progress: 1 },
      ],
    },
  },
  {
    title: 'Dropping files on it',
    note: 'A dashed ink outline says they will go with the task.',
    initial: { noFocus: true, title: 'Expense the team lunch', projectId: 'hm', dropping: true },
  },
  {
    title: 'Not for a day yet',
    note: 'Lands in the Backlog.',
    initial: { noFocus: true, title: 'Renew the domain before it lapses', planned: null },
  },
  {
    title: 'Adding',
    note: 'The button spins, the form holds still.',
    initial: {
      noFocus: true,
      title: 'Book the meeting room for Thursday’s workshop',
      projectId: 'nw',
      saving: true,
    },
  },
  {
    title: 'Added',
    note: 'The button confirms, then it goes.',
    initial: {
      noFocus: true,
      title: 'Review Arjun’s design for the Jira panel empty states',
      planned: '2026-10-19',
      projectId: 'pf',
      added: true,
    },
  },
];

/** Quick Add in its seven states, light and dark, every control working. */
export function QuickAddStates() {
  return (
    <Section
      id="quick-add"
      title="Quick Add"
      lead="One calm sheet for capturing a task from anywhere. Chunk 04."
    >
      {STATES.map((s) => (
        <Pair
          key={s.title}
          title={s.title}
          note={s.note}
          render={() => (
            <QuickAdd
              open
              layer="none"
              today={TODAY}
              projects={PROJECTS}
              initial={s.initial}
              onSave={() => new Promise((r) => setTimeout(r, 700))}
              onNewProject={() => undefined}
            />
          )}
        />
      ))}
    </Section>
  );
}
