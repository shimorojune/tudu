import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IsoDate, TimeBlock } from '@tudu/core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PlanPicker } from './PlanPicker';

const TODAY = '2026-10-18';

function Pick(p: {
  day?: IsoDate | null;
  until?: IsoDate | null;
  time?: TimeBlock | null;
  onSpan?: () => void;
}) {
  const [s, setS] = useState({ day: p.day ?? TODAY, until: p.until ?? null, time: p.time ?? null });
  return (
    <>
      <PlanPicker
        cal={{ today: TODAY, month: '2026-10', marks: {} }}
        today={TODAY}
        day={s.day}
        until={s.until}
        time={s.time}
        onDay={(d) => setS({ ...s, day: d })}
        onSpan={(a, b) => {
          p.onSpan?.();
          setS({ ...s, day: a, until: b });
        }}
        onTime={(t) => setS({ ...s, time: t })}
      />
      <output data-testid="v">{`${s.day}|${s.until ?? ''}`}</output>
    </>
  );
}
const val = () => screen.getByTestId('v').textContent;
const dayBtn = (n: number) =>
  within(screen.getByRole('grid')).getByRole('button', { name: new RegExp(`^${n} October`) });

describe('PlanPicker', () => {
  it('TT-U11 Several days on asks for the last day; one click sets it; off returns to one day; the end field relabels', async () => {
    const user = userEvent.setup();
    render(<Pick />);
    const sw = screen.getByRole('switch', { name: 'Several days' });
    await user.click(sw);
    expect(screen.getByText('Pick the last day')).toBeInTheDocument();
    await user.click(dayBtn(21));
    expect(val()).toBe('2026-10-18|2026-10-21');
    expect(screen.getByText('until Wed 21 Oct')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a time' }));
    expect(screen.getByRole('group', { name: /^Ends on the last day at/ })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Several days' }));
    expect(val()).toBe('2026-10-18|');
    expect(screen.getByRole('group', { name: /^Ends at/ })).toBeInTheDocument();
  });

  it('TT-U09 with a span set, a click starts again (held here), the second either side commits once', async () => {
    const user = userEvent.setup();
    const onSpan = vi.fn();
    render(<Pick until="2026-10-21" onSpan={onSpan} />);
    await user.hover(dayBtn(25));
    expect(screen.getByText('Start again on Sun 25 Oct')).toBeInTheDocument();
    await user.click(dayBtn(25));
    expect(onSpan).not.toHaveBeenCalled();
    expect(val()).toBe('2026-10-18|2026-10-21');
    await user.hover(dayBtn(23));
    expect(screen.getByText('Fri 23 Oct to Sun 25 Oct · 3 days')).toBeInTheDocument();
    await user.click(dayBtn(23));
    expect(onSpan).toHaveBeenCalledTimes(1);
    expect(val()).toBe('2026-10-23|2026-10-25');
  });

  it('TT-U09 closing between the two clicks commits nothing', async () => {
    const user = userEvent.setup();
    const onSpan = vi.fn();
    const { unmount } = render(<Pick until="2026-10-21" onSpan={onSpan} />);
    await user.click(dayBtn(25));
    unmount();
    expect(onSpan).not.toHaveBeenCalled();
  });

  it('TT-U11 a day with no span just moves; the Backlog has no Several days or time', async () => {
    const user = userEvent.setup();
    render(<Pick />);
    await user.click(dayBtn(20));
    expect(val()).toBe('2026-10-20|');
    render(
      <PlanPicker
        cal={{ today: TODAY, month: '2026-10' }}
        today={TODAY}
        day={null}
        until={null}
        time={null}
        onSpan={() => {}}
        onTime={() => {}}
      />,
    );
    expect(screen.getAllByRole('switch', { name: 'Several days' })).toHaveLength(1);
  });
});
