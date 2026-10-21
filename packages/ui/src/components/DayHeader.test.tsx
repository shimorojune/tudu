import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayHeader, type DayHeaderProps } from './DayHeader';

const TODAY = '2026-10-19';

// jsdom has no layout. For the tooltip side, give the viewport a size and put the arrow in the middle of it,
// so floating-ui keeps the side we asked for instead of flipping away from an edge.
function placeInTheMiddle(el: Element) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1024 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => 768 });
  const r = { x: 500, y: 380, width: 32, height: 32 };
  el.getBoundingClientRect = () =>
    ({ ...r, top: r.y, left: r.x, right: r.x + r.width, bottom: r.y + r.height, toJSON: () => r }) as DOMRect;
}

function setup(extra: Partial<DayHeaderProps> = {}) {
  const user = userEvent.setup();
  const onPrev = vi.fn();
  const onNext = vi.fn();
  const onToday = vi.fn();
  const onPick = vi.fn();
  const base: DayHeaderProps = {
    eyebrow: 'Today · Week 43',
    day: 'Monday',
    date: '19 October',
    done: 2,
    total: 7,
    isToday: true,
    onPrev,
    onNext,
    onToday,
    calendar: { month: '2026-10', today: TODAY, selected: TODAY, onPick },
  };
  const page = (p: Partial<DayHeaderProps> = {}) => <DayHeader {...base} {...extra} {...p} />;
  const view = render(page());
  return {
    user,
    onPrev,
    onNext,
    onToday,
    onPick,
    page,
    rerender: view.rerender,
    container: view.container,
    eyebrow: () => view.container.querySelector('.tp-eyebrow'),
    back: () => screen.getByText('Back to today'),
    calendar: () => screen.queryByRole('group', { name: 'Pick a day' }),
  };
}

describe('DayHeader', () => {
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
  });

  it('shows the eyebrow in brand-text on today only; other days are quiet', () => {
    const { container, eyebrow, page, rerender } = setup();
    expect(container.firstChild).toHaveClass('tp-root', 'tp-dh');
    expect(eyebrow()).toHaveTextContent('Today · Week 43');
    expect(eyebrow()).not.toHaveClass('tp-eb-quiet');
    expect(eyebrow()!.parentElement).toHaveClass('tp-dh-top');

    rerender(page({ eyebrow: 'Tomorrow · Week 43', isToday: false }));
    expect(eyebrow()).toHaveTextContent('Tomorrow · Week 43');
    expect(eyebrow()).toHaveClass('tp-eb-quiet');

    // without isToday the eyebrow is not quiet either (a day whose header does not say)
    rerender(page({ isToday: undefined }));
    expect(eyebrow()).not.toHaveClass('tp-eb-quiet');
  });

  it('"Back to today" keeps its slot: hidden on today, shown and live on other days', () => {
    const { back, onToday, page, rerender } = setup();
    expect(back()).toHaveClass('tp-backtoday', 'tp-hide');
    expect(back()).toHaveAttribute('aria-hidden', 'true');
    expect(back()).toHaveAttribute('tabindex', '-1');
    expect(back().parentElement).toHaveClass('tp-dh-turn');
    fireEvent.click(back());
    expect(onToday).not.toHaveBeenCalled();

    rerender(page({ isToday: false }));
    expect(back()).not.toHaveClass('tp-hide');
    expect(back()).not.toHaveAttribute('aria-hidden');
    expect(back()).toHaveAttribute('tabindex', '0');
    fireEvent.click(back());
    expect(onToday).toHaveBeenCalledTimes(1);

    rerender(page({ isToday: false, todayLabel: 'Back to this week' }));
    expect(screen.getByRole('button', { name: 'Back to this week' })).toHaveClass('tp-backtoday');
    rerender(page({ isToday: false, onToday: undefined }));
    expect(screen.queryByText('Back to today')).toBeNull();
  });

  it('the whole title is a button that opens the calendar under it; picking a day closes it', async () => {
    const { user, onPick, calendar } = setup();
    const title = screen.getByRole('button', { name: 'Pick a day. Showing Monday 19 October' });
    expect(title).toHaveClass('tp-day', 'tp-dh-pick');
    expect(title).toHaveAttribute('aria-haspopup', 'dialog');
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(title.querySelector('h1')).toHaveTextContent('Monday');
    expect(title.querySelector('.tp-dh-date')).toHaveTextContent('19 October');
    expect(title.parentElement).toHaveClass('tp-dh-day');
    expect(calendar()).toBeNull();

    await user.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    const cal = calendar();
    expect(cal).not.toBeNull();
    expect(cal!.closest('.tp-dh-pop')).toHaveClass('tp-root');
    expect(within(cal!).getByText('October 2026')).toBeInTheDocument();
    expect(within(cal!).getByRole('button', { name: '19 October' })).toHaveClass('tp-sel');

    await user.click(within(cal!).getByRole('button', { name: '21 October' }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('2026-10-21');
    await waitFor(() => expect(calendar()).toBeNull());
    expect(title).toHaveAttribute('aria-expanded', 'false');

    // Escape closes it too
    await user.click(title);
    expect(calendar()).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(calendar()).toBeNull());
  });

  it('the arrows call onPrev and onNext and put their tooltips below', async () => {
    const { user, onPrev, onNext } = setup();
    const prev = screen.getByRole('button', { name: 'Previous day' });
    const next = screen.getByRole('button', { name: 'Next day' });
    expect(prev).toHaveClass('tp-ib');
    expect(prev.parentElement).toHaveClass('tp-dh-turn');

    // Keyboard focus names the arrow at once, below it. On today the hidden "Back to today" is not a tab stop,
    // so the first Tab lands on the previous-day arrow.
    placeInTheMiddle(prev);
    await user.tab();
    expect(prev).toHaveFocus();
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Previous day');
    await waitFor(() => expect(tip.closest('.tp-tip-pop')).toHaveAttribute('data-side', 'bottom'));

    await user.click(prev);
    expect(onPrev).toHaveBeenCalledTimes(1);
    await user.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('the ring reads the count; compact shrinks it; no total means no ring', () => {
    const { container, page, rerender } = setup();
    expect(screen.getByRole('img', { name: '2 of 7 crossed off' })).toHaveClass('tp-prog');
    expect(container.querySelector('.tp-prog-ring')).toHaveStyle({ width: '36px' });
    expect(container.querySelector('.tp-dh-row .tp-prog')).not.toBeNull();

    rerender(page({ compact: true, done: 7, doneNote: 'That’s the week' }));
    expect(container.firstChild).toHaveClass('tp-compact');
    expect(screen.getByRole('img', { name: 'All 7 crossed off' })).toHaveClass('tp-compact');
    expect(container.querySelector('.tp-prog-ring')).toHaveStyle({ width: '30px' });

    rerender(page({ total: 0 }));
    expect(container.querySelector('.tp-prog')).toBeNull();
  });

  it('nav={false} hides the arrows; without a calendar the title is plain; children are the tools row', () => {
    const { container, page, rerender } = setup({ nav: false, calendar: undefined, children: <i>Tools</i> });
    expect(screen.queryByRole('button', { name: 'Previous day' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next day' })).toBeNull();
    expect(screen.queryByText('Back to today')).toBeNull();
    expect(container.querySelector('.tp-dh-top .tp-eyebrow')).toHaveTextContent('Today · Week 43');
    const title = container.querySelector('.tp-dh-day > .tp-day');
    expect(title?.tagName).toBe('DIV');
    expect(title?.querySelector('h1')).toHaveTextContent('Monday');
    expect(screen.queryByRole('button', { name: /^Pick a day/ })).toBeNull();
    expect(container.querySelector('.tp-dh-tools')).toHaveTextContent('Tools');

    // the Backlog: no eyebrow and no arrows means no top line at all
    rerender(page({ eyebrow: undefined, nav: false }));
    expect(container.querySelector('.tp-dh-top')).toBeNull();
  });

  it('C05-U07 bare puts the arrows on the title line, renames the controls for the week, and the title opens the WeekPicker', async () => {
    const onWeek = vi.fn();
    const { user, container, onPrev, onNext } = setup({
      bare: true,
      isToday: false,
      prevLabel: 'Previous week',
      nextLabel: 'Next week',
      todayLabel: 'Back to this week',
      pickLabel: 'Pick a week',
      weeks: { today: TODAY, selected: TODAY, onPick: onWeek },
    });
    expect(container.firstChild).toHaveClass('tp-bare');
    expect(container.querySelector('.tp-dh-top .tp-dh-turn')).toBeNull();
    expect(container.querySelector('.tp-dh-row > .tp-dh-turn')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Back to this week' })).not.toHaveClass('tp-hide');
    await user.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(onPrev).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    const title = screen.getByRole('button', { name: 'Pick a week. Showing Monday 19 October' });
    await user.click(title);
    const picker = screen.getByRole('group', { name: 'Pick a week' });
    expect(picker).toBeInTheDocument();
    await user.click(within(picker).getByRole('button', { name: /^Week 44,/ }));
    expect(onWeek).toHaveBeenCalledWith('2026-10-26');
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Pick a week' })).toBeNull());
  });

  it('C05-U07 the ring says that’s the week when the week is crossed off', () => {
    const { container } = setup({ done: 3, total: 3, doneNote: 'That’s the week' });
    expect(container.textContent).toContain('That’s the week');
  });

  it('C06-U05 the Backlog: no arrows, no ring, no eyebrow; the count beside the title; the tools in their row; compact on phones', () => {
    const { container, rerender, page } = setup({
      eyebrow: undefined,
      day: 'Backlog',
      date: '4 tasks',
      done: undefined,
      total: undefined,
      isToday: undefined,
      nav: false,
      calendar: undefined,
      onToday: undefined,
      children: (
        <>
          <i>Filter</i>
          <b className="tp-seg">Switch</b>
        </>
      ),
    });
    expect(screen.getByRole('heading', { name: 'Backlog' })).toBeInTheDocument();
    expect(container.querySelector('.tp-dh-date')).toHaveTextContent('4 tasks');
    expect(screen.queryByRole('button', { name: 'Previous day' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.tp-dh-top')).toBeNull();
    const tools = container.querySelector('.tp-dh-tools')!;
    expect(tools.firstElementChild).toHaveTextContent('Filter');
    expect(tools.lastElementChild).toHaveClass('tp-seg');
    expect(container.querySelector('.tp-dh')).not.toHaveClass('tp-compact');
    rerender(page({ compact: true }));
    expect(container.querySelector('.tp-dh')).toHaveClass('tp-compact');
  });
});
