import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, showToast, Toast, ToastHost, TOAST_PLAIN_MS, TOAST_WITH_ACTION_MS } from './Toast';

const LEAVE_MS = 200;

// user-event under fake timers: Testing Library ends every action with a setTimeout(0) that the fake clock holds
// back (it only advances it for Jest). Let that one timer fire so the action settles.
async function settle<T>(action: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(0);
  return action;
}

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ToastHost />);
  const host = screen.getByRole('status');
  return { user, host, toast: () => host.querySelector('.tp-toast') };
}

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('ToastHost', () => {
  beforeEach(() => {
    dismissToast();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('C00-U24 shows the text with its action; the action calls its handler and the toast leaves', async () => {
    const { user, host, toast } = setup();
    const onAction = vi.fn();
    expect(host).toBeEmptyDOMElement();

    act(() => showToast('Task moved', { action: 'Undo', onAction }));
    expect(host).toHaveTextContent('Task moved');
    expect(toast()).toHaveClass('tp-toast-in');

    await settle(user.click(screen.getByRole('button', { name: 'Undo' })));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toast()).toHaveClass('tp-toast-out');

    tick(160);
    expect(host).toBeEmptyDOMElement();
  });

  it('C00-U24 a toast with an action dismisses after 4500ms and takes 200ms to leave', () => {
    const { host, toast } = setup();
    act(() => showToast('Task moved', { action: 'Undo' }));

    tick(TOAST_WITH_ACTION_MS - 1);
    expect(host).toHaveTextContent('Task moved');
    expect(toast()).not.toHaveClass('tp-toast-out');

    tick(1);
    expect(toast()).toHaveClass('tp-toast-out');

    tick(LEAVE_MS - 1);
    expect(host).toHaveTextContent('Task moved');
    tick(1);
    expect(host).toBeEmptyDOMElement();
  });

  it('C00-U24 a plain toast dismisses after 1800ms', () => {
    const { host, toast } = setup();
    act(() => showToast('Task added to Today'));
    expect(screen.queryByRole('button')).toBeNull();

    tick(TOAST_PLAIN_MS - 1);
    expect(toast()).not.toHaveClass('tp-toast-out');
    tick(1);
    expect(toast()).toHaveClass('tp-toast-out');
    tick(LEAVE_MS);
    expect(host).toBeEmptyDOMElement();
  });

  it('C00-U24 a new toast replaces the old one', () => {
    const { host } = setup();
    act(() => showToast('First'));
    tick(1000);
    act(() => showToast('Second'));

    expect(host).not.toHaveTextContent('First');
    expect(host).toHaveTextContent('Second');
    expect(host.querySelectorAll('.tp-toast')).toHaveLength(1);

    // The first toast's timer is gone: the second one gets its full stay.
    tick(TOAST_PLAIN_MS - 1);
    expect(host).toHaveTextContent('Second');
    tick(1 + LEAVE_MS);
    expect(host).toBeEmptyDOMElement();
  });
});

describe('Toast', () => {
  it('C00-U24 the bare Toast renders its text and action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Toast action="Undo" onAction={onAction}>
        Linked task added to Today
      </Toast>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Linked task added to Today');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('C05-U15 a toast still leaves under StrictMode, where React runs state updaters twice (the app runs in it)', () => {
    vi.useFakeTimers();
    dismissToast();
    render(
      <StrictMode>
        <ToastHost />
      </StrictMode>,
    );
    const host = screen.getByRole('status');
    act(() => showToast('Moved to Tue 20 Oct'));
    expect(host).toHaveTextContent('Moved to Tue 20 Oct');
    tick(TOAST_PLAIN_MS);
    expect(host.querySelector('.tp-toast')).toHaveClass('tp-toast-out');
    tick(LEAVE_MS);
    expect(host).toBeEmptyDOMElement();
    // and one with an action, dismissed by its action
    act(() => showToast('Task deleted', { action: 'Undo', onAction: () => {} }));
    act(() => screen.getByRole('button', { name: 'Undo' }).click());
    tick(160);
    expect(host).toBeEmptyDOMElement();
    // a newer toast shown while the old one leaves keeps its place
    act(() => showToast('First'));
    tick(TOAST_PLAIN_MS);
    act(() => showToast('Second'));
    tick(LEAVE_MS);
    expect(host).toHaveTextContent('Second');
    tick(TOAST_PLAIN_MS + LEAVE_MS);
    expect(host).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});
