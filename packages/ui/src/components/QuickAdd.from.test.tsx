import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet } from '../test-utils/stylesheet';
import {
  QA_CLOSE_AFTER_MS,
  QA_FROM_OUT_MS,
  QuickAdd,
  type QuickAddProps,
  type QuickAddSend,
} from './QuickAdd';
import { ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));
const TODAY = '2026-10-18';
const MEERA = { id: 'm', name: 'Meera Nair', email: 'meera@x.y', initials: 'MN' };
const FROM = { noteId: 'n1', name: 'Offsite agenda draft' };

function send(over: Partial<QuickAddSend> = {}): QuickAddSend {
  return {
    spaces: [
      { id: 'me', name: 'Personal', personal: true, initials: 'P' },
      { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N' },
    ],
    spaceId: 'me',
    onSpace: vi.fn(),
    people: [MEERA],
    to: null,
    onTo: vi.fn(),
    me: { name: 'Rohit Raj', initials: 'RR' },
    canSend: true,
    ...over,
  };
}

function Bar(props: Partial<QuickAddProps>) {
  return (
    <>
      <QuickAdd open today={TODAY} projects={[]} send={send()} {...props} />
      <ToastHost />
    </>
  );
}

const pill = () => document.querySelector('.tp-qa-from');
const title = () => screen.getByRole('textbox', { name: 'Task title' });

afterEach(() => vi.useRealTimers());

describe('C04-U30 New task opened from a note', () => {
  it('C04-U30 the seed fills the title and the note, and the pill names the note', async () => {
    render(
      <Bar
        seed={{ title: 'Call the venue', note: '<p>Ask Meera for the headcount</p>', from: FROM, nonce: 1 }}
      />,
    );
    expect(title()).toHaveValue('Call the venue');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Note' }).innerHTML).toContain(
        'Ask Meera for the headcount',
      ),
    );
    expect(pill()).toHaveTextContent('Offsite agenda draft');
    expect(pill()).toHaveAttribute('title', 'Links to the note “Offsite agenda draft”');
  });

  it('C04-U30 a later seed replaces the words; a seed with no note drops the pill', () => {
    const { rerender } = render(<Bar seed={{ title: 'Call the venue', from: FROM, nonce: 1 }} />);
    expect(pill()).not.toBeNull();
    rerender(<Bar seed={{ title: 'Gutters', nonce: 2 }} />);
    expect(title()).toHaveValue('Gutters');
    expect(pill()).toBeNull();
  });

  it('C04-U30 with the pill, Add task hands over from; after Add the next open has no pill', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Bar onSave={onSave} seed={{ title: 'Call the venue', from: FROM, nonce: 1 }} />);
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ title: 'Call the venue', from: FROM });
    await waitFor(() => expect(pill()).toBeNull(), { timeout: QA_CLOSE_AFTER_MS + 500 });
  });

  it('C04-U30 × shrinks the pill away first, then the task does not link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSave = vi.fn();
    render(<Bar onSave={onSave} seed={{ title: 'Call the venue', from: FROM, nonce: 1 }} />);
    await user.click(screen.getByRole('button', { name: 'Don’t link it to this note' }));
    expect(pill()).toHaveClass('tp-out');
    act(() => vi.advanceTimersByTime(QA_FROM_OUT_MS + 10));
    expect(pill()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0].from).toBeNull();
  });

  it('C04-U30 with a person picked the pill hides and the request does not link', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <Bar
        onSave={onSave}
        send={send({ spaceId: 'nw', to: MEERA })}
        seed={{ title: 'Call the venue', from: FROM, nonce: 1 }}
      />,
    );
    expect(pill()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ toId: 'm', from: null });
  });

  it('C04-U30 the pill fades in, shrinks out, and keeps still with Reduce motion', () => {
    const decl = (sel: string) => rules.find((r) => r.selector === sel && !r.context.length)!.declarations;
    expect(decl('.tp-qa-from').animation).toContain('tp-label-in');
    expect(decl('.tp-qa-from.tp-out').opacity).toBe('0');
    expect(decl('.tp-qa-from-n')['text-overflow']).toBe('ellipsis');
    expect(
      rules.some(
        (r) => r.selector === '.tp-qa-from' && r.context.some((c) => c.includes('prefers-reduced-motion')),
      ),
    ).toBe(true);
  });
});
