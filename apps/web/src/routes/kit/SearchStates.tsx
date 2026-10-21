import { QuickAdd, SearchPanel, type SearchItem, type SearchPanelProps } from '@tudu/ui';
import { Pair, Section } from './Pair';

const NW = { name: 'Northwind', color: '#3d5a80' };
const PF = { name: 'Platform', color: '#5b7553' };
const HM = { name: 'Home', color: '#8a5a00' };
const TODAY = '2026-10-18';

const ITEMS: SearchItem[] = [
  { key: 'a', id: 'ME-41', title: 'Sync with Meera on onboarding copy', where: { label: 'Today', tone: 'today' }, project: NW },
  { key: 'b', id: 'ME-60', title: 'Meera’s Quick Add demo', where: { label: 'Tomorrow' }, project: NW },
  { key: 'c', id: 'ME-52', title: 'Review Quick Add PR and leave comments before Meera’s demo on Monday', where: { label: 'Today', tone: 'today' }, project: NW },
  { key: 'd', id: 'ME-26', title: 'Draft the Q4 hiring plan', where: { label: 'Backlog' }, project: NW, snippet: '…Check the budget first, then share the plan with Meera.' },
  { key: 'e', id: 'ME-33', title: 'Draft agenda for the Northwind planning session', where: { label: 'Yesterday · crossed off' }, done: true, project: NW },
];
const DIETARY: SearchItem[] = [
  { key: 'f', id: 'ME-65', title: 'Plan the team offsite agenda', where: { label: 'Wed 21 Oct' }, project: NW, snippet: 'Half a day of planning, half a day out. Ask about dietary needs for the dinner.' },
  { key: 'g', id: 'ME-74', title: 'Plan the team dinner after the offsite', where: { label: 'Backlog' }, project: NW, snippet: 'Somewhere near the venue, walking distance. Ask about dietary needs first.' },
];
const RECENT: SearchItem[] = [
  { key: 'c', id: 'ME-52', title: 'Review Quick Add PR and leave comments before Meera’s demo on Monday', where: { label: 'Today', tone: 'today' }, project: NW },
  { key: 'd', id: 'ME-26', title: 'Draft the Q4 hiring plan', where: { label: 'Backlog' }, project: NW },
  { key: 'h', id: 'ME-75', title: 'Read the RFC on offline sync and leave comments', where: { label: 'Backlog' }, project: PF },
  { key: 'i', id: 'ME-58', title: 'Pay the electricity bill', where: { label: 'Today', tone: 'today' }, project: HM },
];
const HISTORY = ['release notes', 'meera'];
const noop = () => {};

const STATES: Array<{ title: string; note: string; props: Partial<SearchPanelProps> }> = [
  {
    title: 'Opening',
    note: 'Before you type: your recent searches (Clear empties them), then the tasks you opened lately.',
    props: { recent: RECENT, history: HISTORY, initial: { noFocus: true } },
  },
  {
    title: 'Nothing yet',
    note: 'The first time, one line says what it searches.',
    props: { recent: [], history: [], initial: { noFocus: true } },
  },
  {
    title: 'Best match first',
    note: 'Titles that start with the words, then every word at a word’s start, then anywhere; a note match shows a line of it.',
    props: { results: { query: 'meera', hits: ITEMS }, initial: { query: 'meera', noFocus: true } },
  },
  {
    title: 'Found in a note',
    note: 'The note line is cut around the word that matched.',
    props: { results: { query: 'dietary', hits: DIETARY }, initial: { query: 'dietary', noFocus: true } },
  },
  {
    title: 'A task ID',
    note: 'Typed in full, it comes first.',
    props: { results: { query: 'me-52', hits: [ITEMS[2]!] }, initial: { query: 'ME-52', noFocus: true } },
  },
  {
    title: 'No match',
    note: 'Create comes first (Enter creates).',
    props: { results: { query: 'gutter', hits: [] }, initial: { query: 'gutter', noFocus: true } },
  },
  {
    title: 'Loading your tasks',
    note: 'The first answer on its way: skeleton rows, never a spinner.',
    props: { loading: true, initial: { query: 'pay', noFocus: true } },
  },
  {
    title: 'Couldn’t search',
    note: 'Offline or the server away: one quiet line, and Try again.',
    props: { error: true, onRetry: noop, initial: { query: 'pay', noFocus: true } },
  },
];

/** The search panel in every state, and Quick Add with the look-alike line. */
export function SearchStates() {
  return (
    <Section
      id="search"
      title="Search"
      lead="One box that searches your tasks, best match first. Picking a result goes to its day; with no match the first row creates the task."
    >
      {STATES.map((s) => (
        <Pair
          key={s.title}
          title={s.title}
          note={s.note}
          render={() => (
            <div style={{ width: 'min(620px, 100%)' }}>
              <SearchPanel layer="none" onPick={noop} onCreate={noop} onClearHistory={noop} {...s.props} />
            </div>
          )}
        />
      ))}
      <Pair
        title="Phone"
        note="The Search tab opens a full-height sheet; Cancel puts it away. The byline wraps rather than cutting."
        render={() => (
          <div style={{ width: 'min(390px, 100%)', height: 560, display: 'flex' }}>
            <SearchPanel
              layer="none"
              variant="sheet"
              results={{ query: 'meera', hits: ITEMS }}
              initial={{ query: 'meera', noFocus: true }}
              onPick={noop}
              onCreate={noop}
              onClose={noop}
            />
          </div>
        )}
      />
      <Pair
        title="Quick Add: looks like a task you have"
        note="As you write, the same search checks the title. Its title opens that task (the draft stays); × hides it."
        render={() => (
          <QuickAdd
            layer="none"
            open
            today={TODAY}
            projects={[]}
            initial={{
              noFocus: true,
              title: 'Renew my passport',
              similar: [{ key: 'p', title: 'Renew passport', where: { label: 'Backlog' } }],
            }}
          />
        )}
      />
      <Pair
        title="Quick Add: several alike"
        note="The closest shows; “N more” unfolds the rest (up to three)."
        render={() => (
          <QuickAdd
            layer="none"
            open
            today={TODAY}
            projects={[]}
            initial={{
              noFocus: true,
              title: 'Run the migration on staging',
              similar: [
                { key: 'q', title: 'Run the request status enum migration and backfill on staging', where: { label: 'Today' } },
                { key: 'r', title: 'Run the request status enum migration on production', where: { label: 'Tomorrow' } },
              ],
              similarOpen: true,
            }}
          />
        )}
      />
    </Section>
  );
}
