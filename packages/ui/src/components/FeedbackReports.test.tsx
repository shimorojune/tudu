import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyReport } from '@tudu/core';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackReports, reportDay } from './FeedbackReports';

// Sunday 25 October 2026, midday.
const NOW = new Date(2026, 9, 25, 12);
const at = (d: number, h = 10) => new Date(2026, 9, d, h).toISOString();

const REPORTS: MyReport[] = [
  {
    id: 'a',
    kind: 'bug',
    title: 'Dragging a task from Monday to Tuesday puts it back',
    createdAt: at(25),
    state: 'filed',
    issue: { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' },
  },
  {
    id: 'b',
    kind: 'bug',
    title: 'The dock badge still says 2',
    createdAt: at(25, 9),
    state: 'pending',
    issue: null,
  },
  {
    id: 'c',
    kind: 'idea',
    title: 'Let me pin a task to the top of Today',
    createdAt: at(22),
    state: 'filed',
    issue: { number: 139, url: 'https://github.com/shimorojune/tudu/issues/139' },
  },
  { id: 'd', kind: 'idea', title: 'A weekly summary email', createdAt: at(19), state: 'none', issue: null },
  { id: 'e', kind: 'bug', title: 'GitHub said no', createdAt: at(24), state: 'failed', issue: null },
];

describe('FeedbackReports (chunk 19)', () => {
  it('C19-U13 loading skeleton, empty, and an error whose Try again calls back', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<FeedbackReports state="loading" reports={[]} now={NOW} />);
    const busy = screen.getByLabelText('Loading your reports');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy.querySelectorAll('.tp-fbr-skel').length).toBe(4);

    rerender(<FeedbackReports state="ready" reports={[]} now={NOW} />);
    expect(screen.getByText('Nothing sent yet')).toBeInTheDocument();
    expect(
      screen.getByText('What you send shows here with its GitHub issue, so you can follow it.'),
    ).toBeInTheDocument();

    rerender(<FeedbackReports state="error" reports={[]} onRetry={onRetry} now={NOW} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load your reports');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('C19-U13 the list: filed rows link to their issue, a waiting one shimmers, mailed-only ones say so', () => {
    render(<FeedbackReports state="ready" reports={REPORTS} now={NOW} />);
    const list = screen.getByRole('list', { name: 'Your reports' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);

    const filed = screen.getByRole('link', { name: /^Issue #142: Dragging a task/ });
    expect(filed).toHaveAttribute('href', 'https://github.com/shimorojune/tudu/issues/142');
    expect(filed).toHaveAttribute('target', '_blank');
    expect(filed).toHaveTextContent('Today · Something’s wrong');
    expect(screen.getByRole('link', { name: /^Issue #139/ })).toHaveTextContent('Thu · An idea');

    expect(within(rows[1]!).queryByRole('link')).toBeNull();
    expect(rows[1]).toHaveTextContent('Today · Waiting for GitHub');
    expect(within(rows[1]!).getByLabelText('Waiting for GitHub')).toHaveClass('tp-fbr-shim');

    expect(within(rows[3]!).queryByRole('link')).toBeNull();
    expect(rows[3]).toHaveTextContent('19 Oct · Sent by email');
    expect(rows[4]).toHaveTextContent('Yesterday · Sent by email');
  });

  it('C19-U13 the day words: Today, Yesterday, the weekday for five days, then the date', () => {
    expect(reportDay(at(25, 1), NOW)).toBe('Today');
    expect(reportDay(at(24), NOW)).toBe('Yesterday');
    expect(reportDay(at(19), NOW)).toBe('19 Oct');
    expect(reportDay(at(20), NOW)).toBe('Tue');
  });
});
