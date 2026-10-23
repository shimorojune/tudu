import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tudu/client';
import type { FeedbackReport } from '@tudu/core';
import { ToastHost } from '@tudu/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFeedbackDraft,
  closeFeedback,
  FeedbackHost,
  FeedbackQueue,
  MemoryFeedbackStore,
  openFeedback,
  setFeedbackQueue,
  type QueuedReport,
} from './feedback';

const location = { pathname: '/me/backlog', searchStr: '', hash: '' };
vi.mock('@tanstack/react-router', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useRouterState: ({ select }: { select: (s: { location: typeof location }) => unknown }) =>
    select({ location }),
}));

const report = (text = 'The tick came back'): FeedbackReport => ({
  id: crypto.randomUUID(),
  kind: 'bug',
  text,
  details: null,
});
const queued = (r = report(), shot = true): QueuedReport => ({
  report: r,
  shot: shot
    ? {
        blob: new Blob([new Uint8Array(3)], { type: 'image/png' }),
        name: 'Screenshot.png',
        type: 'image/png',
      }
    : null,
});

describe('C19-U05 the queue', () => {
  it('C19-U05 offline keeps the report with its image, sends it once on reconnect, and drops it after the 200', async () => {
    const store = new MemoryFeedbackStore();
    const sent: QueuedReport[] = [];
    let up = false;
    const send = vi.fn(async (q: QueuedReport) => {
      if (!up) throw new TypeError('Network request failed');
      sent.push(q);
    });
    const q = new FeedbackQueue(store, send);
    const one = queued();
    expect(await q.submit(one, false)).toBe('queued');
    expect(send).not.toHaveBeenCalled();
    expect((await store.all())[0]!.shot!.name).toBe('Screenshot.png');
    // Online but the request fails on the way: kept too.
    const two = queued(report('Second'), false);
    expect(await q.submit(two, true)).toBe('queued');
    expect(await store.all()).toHaveLength(2);
    // A flush while still down sends nothing and keeps both.
    await q.flush();
    expect(sent).toHaveLength(0);
    expect(await store.all()).toHaveLength(2);
    // Back: each goes once, oldest first, and the store empties; two flushes at once do not double it.
    up = true;
    await Promise.all([q.flush(), q.flush()]);
    expect(sent.map((s) => s.report.text)).toEqual(['The tick came back', 'Second']);
    expect(await store.all()).toHaveLength(0);
    // Kept across a reload: a new queue on the same store sends what waits.
    up = false;
    await q.submit(queued(report('Third')), false);
    up = true;
    await new FeedbackQueue(store, send).flush();
    expect(sent.at(-1)!.report.text).toBe('Third');
  });

  it('C19-U05 a refusal for good (400) is not queued when sending, and is dropped from the queue; 429 and 500 wait', async () => {
    const store = new MemoryFeedbackStore();
    let status = 400;
    const send = vi.fn(async () => {
      throw new ApiError(status, 'That is too long.');
    });
    const q = new FeedbackQueue(store, send);
    await expect(q.submit(queued(), true)).rejects.toThrow('That is too long.');
    expect(await store.all()).toHaveLength(0);
    status = 503;
    expect(await q.submit(queued(), true)).toBe('queued');
    status = 429;
    await q.flush();
    expect(await store.all()).toHaveLength(1);
    status = 400;
    await q.flush();
    expect(await store.all()).toHaveLength(0);
  });
});

describe('C19-U06 the draft and the details switch', () => {
  let send: ReturnType<typeof vi.fn<(q: QueuedReport) => Promise<void>>>;
  beforeEach(() => {
    localStorage.clear();
    send = vi.fn(async (_q: QueuedReport) => {});
    setFeedbackQueue(new FeedbackQueue(new MemoryFeedbackStore(), send));
  });
  afterEach(() => {
    cleanup();
    act(() => {
      closeFeedback();
      clearFeedbackDraft();
    });
    setFeedbackQueue(null);
  });
  const mount = () =>
    render(
      <>
        <FeedbackHost space={{ kind: 'team' }} vp="desktop" />
        <ToastHost />
      </>,
    );
  const box = () => screen.getByRole('textbox', { name: /^What (happened|would help)\?$/ });

  it('C19-U06 the draft survives closing and reopening; Send clears it and says thanks', async () => {
    const user = userEvent.setup();
    mount();
    act(() => openFeedback());
    await user.click(screen.getByRole('button', { name: 'An idea' }));
    await user.type(box(), 'Snooze to a time');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(box()).toHaveValue('Snooze to a time');
    expect(box()).toHaveAccessibleName('What would help?');
    // The details name the page from the address's view, never the address.
    expect(screen.getByText(/, the Backlog page\. Never your tasks\.$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const q = send.mock.calls[0]![0] as QueuedReport;
    expect(q.report).toMatchObject({ kind: 'idea', text: 'Snooze to a time' });
    expect(q.report.details).toMatchObject({ page: 'Backlog', space: 'team', track: 'web' });
    expect(await screen.findByText('Thanks. That’s with the Tudu team now.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(box()).toHaveValue('');
    expect(box()).toHaveAccessibleName('What happened?');
  });

  it('C19-U06 the details switch remembers its last value on this device, and off sends none', async () => {
    const user = userEvent.setup();
    const first = mount();
    act(() => openFeedback());
    const sw = () => screen.getByRole('switch', { name: 'Include app details' });
    expect(sw()).toBeChecked();
    await user.click(sw());
    expect(localStorage.getItem('tudu.feedback.details')).toBe('off');
    first.unmount();
    mount();
    expect(sw()).not.toBeChecked();
    await user.type(box(), 'No details please');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((send.mock.calls[0]![0] as QueuedReport).report.details).toBeNull();
  });
});
