import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchItem } from './SearchHit';
import { SearchPanel, SP_LEAVE_MS, type SearchPanelProps } from './SearchPanel';

const HITS: SearchItem[] = [
  {
    key: 'a',
    id: 'ME-41',
    title: 'Sync with Meera on onboarding copy',
    where: { label: 'Today', tone: 'today' },
  },
  { key: 'b', id: 'ME-60', title: 'Meera’s Quick Add demo', where: { label: 'Tomorrow' } },
];
const RECENT: SearchItem[] = [
  { key: 'c', id: 'ME-52', title: 'Review the PR', where: { label: 'Today', tone: 'today' } },
  { key: 'd', id: 'ME-26', title: 'Draft the hiring plan', where: { label: 'Backlog' } },
];

function Panel(props: Partial<SearchPanelProps>) {
  return <SearchPanel open {...props} />;
}

const box = () => screen.getByRole('combobox', { name: 'Search tasks' });
const options = () => screen.getAllByRole('option').map((o) => o.textContent);
const list = () => screen.getByRole('listbox', { name: 'Matching tasks' });

afterEach(() => vi.useRealTimers());

describe('C07-U05 what the panel shows', () => {
  it('before you type: Recent searches with Clear, then Recently opened; the box is focused', async () => {
    const onClear = vi.fn();
    render(<Panel recent={RECENT} history={['release notes', 'meera']} onClearHistory={onClear} />);
    await waitFor(() => expect(box()).toHaveFocus());
    const heads = [...list().querySelectorAll('.tp-sp-head')].map((h) => h.textContent);
    expect(heads).toEqual(['Recent searchesClear', 'Recently opened']);
    expect(options()).toEqual([
      'release notes',
      'meera',
      expect.stringContaining('Review the PR'),
      expect.stringContaining('Draft the hiring plan'),
    ]);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Search tasks' })).toHaveClass('tp-sp-desk');
    expect(document.querySelector('.tp-sp-layer')).toHaveClass('tp-sp-layer-dialog');
  });

  it('the first time, with nothing yet, one line says what it searches', () => {
    render(<Panel recent={[]} history={[]} />);
    expect(list().textContent).toBe('Search your tasks by title, task ID or note.');
    expect(screen.queryAllByRole('option')).toEqual([]);
  });

  it('words typed ask the app and list its hits in order; the words are marked; the rows stay while the next answer comes', async () => {
    const user = userEvent.setup();
    const onQuery = vi.fn();
    const { rerender } = render(<Panel onQuery={onQuery} recent={RECENT} />);
    await user.type(box(), 'meera');
    expect(onQuery).toHaveBeenLastCalledWith('meera');
    // no answer yet: skeleton rows, never a spinner
    expect(list().querySelector('.tp-sp-load')).not.toBeNull();
    expect(screen.queryAllByRole('option')).toEqual([]);
    rerender(<Panel onQuery={onQuery} recent={RECENT} results={{ query: 'meera', hits: HITS }} />);
    expect(options()).toEqual([
      expect.stringContaining('Sync with Meera'),
      expect.stringContaining('Meera’s Quick Add demo'),
    ]);
    expect(list().querySelectorAll('mark.tp-hl')).toHaveLength(2);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    // the next word: the old rows stay until the answer for it comes; no "No task matches" meanwhile
    await user.type(box(), ' x');
    expect(onQuery).toHaveBeenLastCalledWith('meera x');
    expect(options()).toHaveLength(2);
    expect(screen.queryByText(/No task matches/)).toBeNull();
    rerender(<Panel onQuery={onQuery} recent={RECENT} results={{ query: 'meera x', hits: [] }} />);
    expect(list().querySelector('.tp-sp-none')!.textContent).toBe('No task matches “meera x”.');
    expect(options()).toEqual(['Create “meera x”Opens Quick Add with this as the title']);
  });

  it('the quiet line with Try again when the search could not run; the loading rows while the first answer comes', async () => {
    const onRetry = vi.fn();
    render(<Panel error onRetry={onRetry} initial={{ query: 'pay' }} />);
    expect(screen.getByRole('status').textContent).toBe('Couldn’t search right now.Try again');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('option')).toEqual([]);
  });
});

describe('C07-U06 working the panel', () => {
  it('arrows walk the rows and wrap, Enter picks, the pointer moves the active row', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onSearched = vi.fn();
    render(
      <Panel
        results={{ query: 'meera', hits: HITS }}
        initial={{ query: 'meera' }}
        onPick={onPick}
        onSearched={onSearched}
      />,
    );
    await waitFor(() => expect(box()).toHaveFocus());
    const opts = screen.getAllByRole('option');
    expect(box()).toHaveAttribute('aria-activedescendant', opts[0]!.id);
    await user.keyboard('{ArrowDown}');
    expect(opts[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(opts[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    expect(opts[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.mouseMove(opts[0]!);
    expect(opts[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(HITS[0]);
    expect(onSearched).toHaveBeenCalledWith('meera');
  });

  it('Enter on no match creates with the words; a recent search runs again; Esc closes; × clears then closes', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onQuery = vi.fn();
    const onClose = vi.fn();
    render(
      <Panel
        results={{ query: 'gutter', hits: [] }}
        initial={{ query: 'gutter' }}
        history={['meera']}
        onCreate={onCreate}
        onQuery={onQuery}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(box()).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('gutter');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
    expect(onQuery).toHaveBeenLastCalledWith('');
    await user.click(screen.getByRole('option', { name: 'meera' }));
    expect(box()).toHaveValue('meera');
    expect(onQuery).toHaveBeenLastCalledWith('meera');
    await user.clear(box());
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('the sheet on phones has Cancel and a small clear button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Panel variant="sheet" initial={{ query: 'pay' }} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Search tasks' })).toHaveClass('tp-sp-phone');
    expect(document.querySelector('.tp-sp-layer')).toHaveClass('tp-sp-layer-sheet');
    expect(document.querySelector('.tp-sp-clrpos')).not.toHaveClass('tp-hide');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
    expect(document.querySelector('.tp-sp-clrpos')).toHaveClass('tp-hide');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reopening brings the last search that led somewhere back, selected; closing leaves and unmounts after its beat', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onPick = vi.fn();
    const { rerender } = render(<Panel results={{ query: 'meera', hits: HITS }} onPick={onPick} />);
    await user.type(box(), 'meera');
    await user.click(screen.getAllByRole('option')[1]!);
    expect(onPick).toHaveBeenCalledTimes(1);
    rerender(<Panel open={false} results={{ query: 'meera', hits: HITS }} onPick={onPick} />);
    expect(document.querySelector('.tp-sp-layer')).toHaveClass('tp-leaving');
    act(() => vi.advanceTimersByTime(SP_LEAVE_MS + 10));
    expect(document.querySelector('.tp-sp-layer')).toBeNull();
    rerender(<Panel results={{ query: 'meera', hits: HITS }} onPick={onPick} />);
    expect(box()).toHaveValue('meera');
    act(() => vi.advanceTimersByTime(40));
    const input = box() as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
    expect(options()).toHaveLength(2);
    // a search that led nowhere is not kept
    rerender(
      <Panel open={false} results={{ query: 'meera', hits: HITS }} onPick={onPick} keepLast={false} />,
    );
    act(() => vi.advanceTimersByTime(SP_LEAVE_MS + 10));
    rerender(<Panel results={{ query: 'meera', hits: HITS }} onPick={onPick} keepLast={false} />);
    expect(box()).toHaveValue('');
  });

  it('in the page (the kit) it is a search region with no veil', () => {
    render(
      <SearchPanel
        layer="none"
        initial={{ query: 'meera', noFocus: true }}
        results={{ query: 'meera', hits: HITS }}
      />,
    );
    expect(screen.getByRole('search', { name: 'Search tasks' })).toBeInTheDocument();
    expect(document.querySelector('.tp-sp-veil')).toBeNull();
    expect(within(list()).getAllByRole('option')).toHaveLength(2);
  });
});
