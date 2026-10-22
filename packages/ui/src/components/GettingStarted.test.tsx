import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GettingStarted, GS_LEAVE_MS, type GettingStartedItem } from './GettingStarted';

const rows = (done: boolean[] = [false, false, false, false], onDo = vi.fn()): GettingStartedItem[] =>
  [
    ['name', 'Add your name and photo', 'So people know it’s you'],
    ['task', 'Write your first task', 'It stays on Today until you cross it off'],
    ['theme', 'Pick light or dark', 'Or let it follow your computer'],
    ['jira', 'Bring your Jira issues', 'Optional'],
  ].map(([key, label, sub], i) => ({ key: key!, label: label!, sub, done: done[i], onDo: () => onDo(key) }));

describe('GettingStarted', () => {
  it('C12-U01 shows the four rows, the count and the ring; a done row is crossed off and ignores clicks', async () => {
    const onDo = vi.fn();
    const { container, rerender } = render(<GettingStarted items={rows(undefined, onDo)} />);
    const card = screen.getByRole('region', { name: 'Getting started' });
    expect(card).toHaveClass('tp-root', 'tp-gs');
    expect(card).toHaveTextContent('Getting started');
    expect(container.querySelector('.tp-gs-n')).toHaveTextContent('0 of 4');
    expect(container.querySelector<HTMLElement>('.tp-gs-ring')!.style.getPropertyValue('--p')).toBe('0');
    for (const [label, sub] of [
      ['Add your name and photo', 'So people know it’s you'],
      ['Write your first task', 'It stays on Today until you cross it off'],
      ['Pick light or dark', 'Or let it follow your computer'],
      ['Bring your Jira issues', 'Optional'],
    ])
      expect(screen.getByRole('button', { name: `${label}, ${sub}` })).toBeInTheDocument();
    expect(container.querySelectorAll('.tp-gs-go')).toHaveLength(4);

    await userEvent.click(screen.getByRole('button', { name: /Write your first task/ }));
    expect(onDo).toHaveBeenCalledWith('task');

    rerender(<GettingStarted items={rows([true, true, false, false], onDo)} />);
    expect(container.querySelector('.tp-gs-n')).toHaveTextContent('2 of 4');
    expect(container.querySelector<HTMLElement>('.tp-gs-ring')!.style.getPropertyValue('--p')).toBe('0.5');
    const done = screen.getByRole('button', { name: /Add your name and photo/ });
    expect(done).toHaveClass('tp-gs-it', 'tp-done');
    expect(done).toHaveAttribute('aria-disabled', 'true');
    expect(done.querySelector('.tp-gs-box svg')).not.toBeNull();
    expect(done.querySelector('.tp-gs-go')).toBeNull();
    onDo.mockClear();
    await userEvent.click(done);
    expect(onDo).not.toHaveBeenCalled();
  });

  it('C12-U01 the title folds and unfolds and reports it; phones start folded', async () => {
    const onCollapse = vi.fn();
    const { container, unmount } = render(<GettingStarted items={rows()} onCollapse={onCollapse} />);
    const title = screen.getByRole('button', { name: /Getting started/ });
    expect(title).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.tp-gs')).toHaveClass('tp-collapsed');
    expect(onCollapse).toHaveBeenLastCalledWith(true);
    await userEvent.click(title);
    expect(onCollapse).toHaveBeenLastCalledWith(false);
    unmount();

    render(<GettingStarted items={rows()} phone />);
    const card = screen.getByRole('region', { name: 'Getting started' });
    expect(card).toHaveClass('tp-gs-phone', 'tp-collapsed');
    expect(screen.getByRole('button', { name: /Getting started/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('C12-U01 × calls onClose; four done says You’re set; closing leaves, then unmounts', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const { container, rerender } = render(
        <GettingStarted items={rows([true, true, true, true])} onClose={onClose} />,
      );
      expect(screen.getByRole('region', { name: 'Getting started' })).toHaveTextContent('You’re set');
      expect(container.querySelector('.tp-gs-n')).toHaveTextContent('4 of 4');
      expect(container.querySelector('.tp-gs')).toHaveClass('tp-all');
      act(() => screen.getByRole('button', { name: 'Hide' }).click());
      expect(onClose).toHaveBeenCalledTimes(1);

      rerender(<GettingStarted items={rows([true, true, true, true])} open={false} onClose={onClose} />);
      expect(container.querySelector('.tp-gs')).toHaveClass('tp-leaving');
      act(() => vi.advanceTimersByTime(GS_LEAVE_MS - 10));
      expect(container.querySelector('.tp-gs')).not.toBeNull();
      act(() => vi.advanceTimersByTime(20));
      expect(container.querySelector('.tp-gs')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
