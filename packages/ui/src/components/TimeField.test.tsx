import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Clock } from '@tudu/core';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { TimeField } from './TimeField';

function Field({ start = '09:00' as Clock, ok }: { start?: Clock; ok?: (t: Clock) => boolean }) {
  const [v, setV] = useState<Clock>(start);
  return (
    <>
      <TimeField label="Starts at" value={v} onChange={setV} ok={ok} />
      <output data-testid="v">{v}</output>
    </>
  );
}
const val = () => screen.getByTestId('v').textContent;
const seg = (name: string) => screen.getByRole('spinbutton', { name });

describe('TimeField', () => {
  it('TT-U06 typing 3, 0, 5 is 3:05; Up/Down step hours and minutes by 5; AM/PM wraps; Left/Right move; aria-valuetext', async () => {
    const user = userEvent.setup();
    render(<Field />);
    expect(screen.getByRole('group', { name: 'Starts at 9 AM' })).toBeInTheDocument();
    seg('Hour').focus();
    await user.keyboard('3');
    expect(val()).toBe('03:00');
    expect(seg('Minutes')).toHaveFocus();
    await user.keyboard('05');
    expect(val()).toBe('03:05');
    expect(seg('AM or PM')).toHaveFocus();
    await user.keyboard('p');
    expect(val()).toBe('15:05');
    expect(seg('AM or PM')).toHaveAttribute('aria-valuetext', 'PM');
    await user.keyboard('{ArrowLeft}');
    expect(seg('Minutes')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(val()).toBe('15:10');
    await user.keyboard('{ArrowLeft}{ArrowDown}');
    expect(val()).toBe('14:10');
    expect(seg('Hour')).toHaveAttribute('aria-valuetext', '2');
    await user.keyboard('{ArrowRight}');
    expect(seg('Minutes')).toHaveFocus();
    expect(seg('Minutes')).toHaveAttribute('aria-valuetext', '10');
  });

  it('TT-U06 a time the field must refuse keeps the value', async () => {
    const user = userEvent.setup();
    render(<Field start="10:00" ok={(t) => t > '09:30'} />);
    seg('Hour').focus();
    await user.keyboard('{ArrowDown}');
    expect(val()).toBe('10:00');
    await user.keyboard('{ArrowUp}');
    expect(val()).toBe('11:00');
  });
});
