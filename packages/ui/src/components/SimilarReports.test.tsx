import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SimilarIssue } from '@tudu/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimilarReports, SIMILAR_SHIMMER_MS, similarMeta } from './SimilarReports';

const ISSUES: SimilarIssue[] = [
  {
    number: 64,
    title: 'Jira count stuck at 1 with 2 assigned',
    url: 'https://github.com/shimorojune/tudu/issues/64',
    state: 'fixed',
    createdAt: '2026-10-24T10:00:00.000Z',
    closedAt: '2026-11-05T10:00:00.000Z',
    plusOnes: 2,
  },
  {
    number: 62,
    title: 'Jira pane should close on an outside click',
    url: 'https://github.com/shimorojune/tudu/issues/62',
    state: 'open',
    createdAt: '2026-10-27T10:00:00.000Z',
    closedAt: null,
    plusOnes: 0,
  },
  {
    number: 50,
    title: 'Make the public issue a general toggle',
    url: 'https://github.com/shimorojune/tudu/issues/50',
    state: 'closed',
    createdAt: '2026-10-20T10:00:00.000Z',
    closedAt: '2026-10-29T10:00:00.000Z',
    plusOnes: 1,
  },
];

const fold = () => screen.getByTestId('similar-reports');

describe('SimilarReports (#76)', () => {
  afterEach(() => vi.useRealTimers());

  it('C19-U26 hidden folds shut; loading shimmers; error is one quiet line; ready lists rows with Fixed, Closed and +1 counts', () => {
    const { rerender, unmount } = render(<SimilarReports state="hidden" issues={[]} />);
    expect(fold()).toHaveClass('tp-hide');
    expect(fold()).toHaveAttribute('aria-hidden', 'true');

    rerender(<SimilarReports state="loading" issues={[]} />);
    expect(fold()).not.toHaveClass('tp-hide');
    expect(screen.getByText('Checking for similar reports…')).toBeInTheDocument();
    expect(document.querySelectorAll('.tp-sim-skel')).toHaveLength(2);
    unmount();

    // (A fresh one: after a look the shimmer holds a moment first, see C19-U26b.)
    const err = render(<SimilarReports state="error" issues={[]} />);
    expect(err.getByRole('status')).toHaveTextContent(
      'Couldn’t check for similar reports. Sending works as usual.',
    );
    err.unmount();

    const ready = render(<SimilarReports state="ready" issues={ISSUES} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('#64Jira count stuck at 1 with 2 assigned');
    expect(rows[0]).toHaveTextContent('Fixed');
    expect(rows[0]).toHaveTextContent('closed 5 Nov · 2 +1s');
    expect(rows[1]).toHaveTextContent('opened 27 Oct');
    expect(rows[1]).not.toHaveTextContent('Fixed');
    expect(rows[2]).toHaveTextContent('Closed');
    expect(screen.getByRole('img', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Closed, fixed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Closed, not planned' })).toBeInTheDocument();
    expect(screen.getByText('Already reported?')).toBeInTheDocument();
    // Ready with nothing: folded shut, the form as today.
    ready.rerender(<SimilarReports state="ready" issues={[]} />);
    expect(fold()).toHaveClass('tp-hide');
  });

  it('C19-U26b the first answer waits out the shimmer; stale rows dim', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SimilarReports state="loading" issues={[]} />);
    rerender(<SimilarReports state="ready" issues={ISSUES} />);
    expect(screen.getByText('Checking for similar reports…')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SIMILAR_SHIMMER_MS);
    });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    rerender(<SimilarReports state="ready" issues={ISSUES} stale />);
    expect(screen.getByRole('list', { name: 'Similar reports' })).toHaveClass('tp-stale');
  });

  it('C19-U27 +1 picks; the pick is pressed with a tick; again unpicks; a pick the words dropped stays first', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const { rerender } = render(<SimilarReports state="ready" issues={ISSUES} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: '+1 #62 instead of a new issue' }));
    expect(onPick).toHaveBeenLastCalledWith(ISSUES[1]);
    rerender(<SimilarReports state="ready" issues={ISSUES} picked={ISSUES[1]} onPick={onPick} />);
    const on = screen.getByRole('button', { name: '+1 #62 instead of a new issue, picked' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on.closest('li')).toHaveClass('tp-picked');
    expect(on).not.toHaveTextContent('+1');
    await user.click(on);
    expect(onPick).toHaveBeenLastCalledWith(null);
    // Later words no longer find it: it stays, pinned first.
    rerender(<SimilarReports state="ready" issues={[ISSUES[0]!]} picked={ISSUES[1]} onPick={onPick} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('#62');
    // Even when nothing is found at all, or the look fails.
    rerender(<SimilarReports state="error" issues={[]} picked={ISSUES[1]} onPick={onPick} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(fold()).not.toHaveClass('tp-hide');
  });

  it('C19-U28 the arrow opens the issue; the labels say what each control does', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<SimilarReports state="ready" issues={ISSUES} onOpen={onOpen} />);
    await user.click(screen.getByRole('link', { name: 'Open #64 on GitHub' }));
    expect(onOpen).toHaveBeenCalledWith('https://github.com/shimorojune/tudu/issues/64');
    expect(screen.getByRole('button', { name: '+1 #64 instead of a new issue' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(similarMeta({ ...ISSUES[1]!, plusOnes: 1 })).toBe('opened 27 Oct · 1 +1');
  });
});
