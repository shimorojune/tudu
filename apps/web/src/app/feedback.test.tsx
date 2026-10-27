import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tudu/client';
import type { FeedbackReport, FeedbackSent, MyReports } from '@tudu/core';
import { dismissToast, ToastHost } from '@tudu/ui';
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

// Your reports, as GET /api/feedback/mine answers; each test sets what the server says.
const mine = vi.hoisted(() => ({
  answer: { filing: 'email', reports: [] } as MyReports | Error,
  calls: 0,
}));
vi.mock('./session', () => ({
  api: {
    get: vi.fn(async () => {
      mine.calls++;
      if (mine.answer instanceof Error) throw mine.answer;
      return mine.answer;
    }),
  },
}));
const opened = vi.hoisted(() => [] as string[]);
vi.mock('./links', () => ({ openOutside: (url: string) => opened.push(url) }));

const ISSUE = { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' };

const report = (text = 'The tick came back'): FeedbackReport => ({
  id: crypto.randomUUID(),
  kind: 'bug',
  text,
  details: null,
  shotPublic: false,
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
    expect((await q.submit(one, false)).how).toBe('queued');
    expect(send).not.toHaveBeenCalled();
    expect((await store.all())[0]!.shot!.name).toBe('Screenshot.png');
    // Online but the request fails on the way: kept too.
    const two = queued(report('Second'), false);
    expect((await q.submit(two, true)).how).toBe('queued');
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
    // The choice to show the screenshot on the issue waits with it.
    up = false;
    await q.submit(queued({ ...report('Fourth'), shotPublic: true }), false);
    up = true;
    await new FeedbackQueue(store, send).flush();
    expect(sent.at(-1)!.report).toMatchObject({ text: 'Fourth', shotPublic: true });
  });

  it('C19-U05 a refusal for good (400) or too many this hour (429) is said, not queued; a queued one waits on 429 and 500', async () => {
    const store = new MemoryFeedbackStore();
    let status = 400;
    const send = vi.fn(async () => {
      throw new ApiError(status, 'That is too long.');
    });
    const q = new FeedbackQueue(store, send);
    await expect(q.submit(queued(), true)).rejects.toThrow('That is too long.');
    expect(await store.all()).toHaveLength(0);
    status = 429;
    await expect(q.submit(queued(), true)).rejects.toThrow();
    expect(await store.all()).toHaveLength(0);
    status = 503;
    expect((await q.submit(queued(), true)).how).toBe('queued');
    status = 429;
    await q.flush();
    expect(await store.all()).toHaveLength(1);
    status = 400;
    await q.flush();
    expect(await store.all()).toHaveLength(0);
  });

  it('C19-U05 the answer’s issue comes back from submit; a queued report that lands later tells its issue once', async () => {
    const store = new MemoryFeedbackStore();
    let up = true;
    let n = 142;
    const send = vi.fn(async (): Promise<FeedbackSent> => {
      if (!up) throw new TypeError('Network request failed');
      return {
        id: 'x',
        issue: { number: n, url: `https://github.com/shimorojune/tudu/issues/${n}` },
        pending: false,
      };
    });
    const q = new FeedbackQueue(store, send);
    expect(await q.submit(queued(), true)).toEqual({
      how: 'sent',
      issue: { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' },
      pending: false,
    });
    const landed = vi.fn();
    const off = q.onLanded(landed);
    up = false;
    expect(await q.submit(queued(), true)).toEqual({ how: 'queued', issue: null, pending: false });
    up = true;
    n = 143;
    await Promise.all([q.flush(), q.flush()]);
    expect(landed).toHaveBeenCalledTimes(1);
    expect(landed).toHaveBeenCalledWith({
      number: 143,
      url: 'https://github.com/shimorojune/tudu/issues/143',
    });
    await q.flush();
    expect(landed).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('C19-U06 the draft and the details switch', () => {
  let send: ReturnType<typeof vi.fn<(q: QueuedReport) => Promise<FeedbackSent | void>>>;
  beforeEach(() => {
    localStorage.clear();
    mine.answer = { filing: 'email', reports: [] };
    mine.calls = 0;
    opened.length = 0;
    send = vi.fn(async (_q: QueuedReport): Promise<FeedbackSent | void> => {});
    setFeedbackQueue(new FeedbackQueue(new MemoryFeedbackStore(), send));
  });
  afterEach(() => {
    cleanup();
    act(() => {
      closeFeedback();
      clearFeedbackDraft();
      dismissToast();
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

  it('C19-U06 the draft survives closing and reopening; Send (email only) clears it and says thanks', async () => {
    const user = userEvent.setup();
    mount();
    act(() => openFeedback());
    await waitFor(() => expect(screen.queryByRole('button', { name: /Public on GitHub/ })).toBeNull());
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

  it('C19-U06 Send with GitHub on shows Filed and stays; Done clears the draft and toasts the number with Copy link', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    send.mockResolvedValue({ id: 'x', issue: ISSUE, pending: false });
    mount();
    act(() => openFeedback());
    expect(
      await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/, the Backlog page\. Shown on the issue\. Never your tasks\.$/),
    ).toBeInTheDocument();
    await user.type(box(), 'Drag puts it back');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('dialog', { name: 'Thanks, it’s filed' })).toBeInTheDocument();
    expect(document.querySelector('.tp-fb-num')).toHaveTextContent('#142');
    // It stays until you choose.
    await new Promise((r) => setTimeout(r, 900));
    expect(screen.getByRole('dialog', { name: 'Thanks, it’s filed' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open on GitHub' }));
    expect(opened).toEqual([ISSUE.url]);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('Filed as #142 on GitHub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(box()).toHaveValue('');
  });

  it('C19-U22 the report says whether to show the screenshot; a new screenshot starts private; email only never asks', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    send.mockResolvedValue({ id: 'x', issue: ISSUE, pending: false });
    mount();
    act(() => openFeedback());
    await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' });
    const shot = (name: string) => new File([new Uint8Array(2048)], name, { type: 'image/png' });
    const sw = () => screen.getByRole('switch', { name: 'Show the screenshot on the public issue' });
    await user.type(box(), 'Drag puts it back');
    await user.upload(screen.getByLabelText('Choose a screenshot'), shot('One.png'));
    await waitFor(() => expect(sw()).toBeInTheDocument());
    await user.click(sw());
    expect(sw()).toBeChecked();
    // Another screenshot: private again.
    await user.upload(screen.getByLabelText('Choose a screenshot'), shot('Two.png'));
    await waitFor(() => expect(document.querySelector('.tp-fb-nm')).toHaveTextContent('Two.png'));
    expect(sw()).not.toBeChecked();
    await user.click(sw());
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((send.mock.calls[0]![0] as QueuedReport).report.shotPublic).toBe(true);
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Sent and cleared: the next draft starts private, with no screenshot.
    act(() => openFeedback());
    expect(screen.queryByRole('switch', { name: 'Show the screenshot on the public issue' })).toBeNull();
    await user.type(box(), 'No shot this time');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect((send.mock.calls[1]![0] as QueuedReport).report.shotPublic).toBe(false);
  });

  it('C19-U15 a pending answer shows Sent with the issue to follow; a refusal shows its line and keeps the words', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    send.mockResolvedValueOnce({ id: 'x', issue: null, pending: true });
    mount();
    act(() => openFeedback());
    await user.type(box(), 'Badge says 2');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('dialog', { name: 'Thanks, it’s sent' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(/Filed as/)).toBeNull();

    send.mockRejectedValueOnce(
      new ApiError(429, 'That’s a lot of reports in an hour. Your words are kept; send it a little later.'),
    );
    act(() => openFeedback());
    await user.type(box(), 'Another one');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That’s a lot of reports in an hour.');
    expect(box()).toHaveValue('Another one');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('C19-U16 Your reports is fetched on first open and after each send; Back returns to the view it came from', async () => {
    const user = userEvent.setup();
    mine.answer = {
      filing: 'github',
      reports: [
        {
          id: 'a',
          kind: 'bug',
          title: 'Older one',
          createdAt: new Date().toISOString(),
          state: 'filed',
          issue: { number: 7, url: 'https://github.com/shimorojune/tudu/issues/7' },
        },
      ],
    };
    send.mockResolvedValue({ id: 'x', issue: ISSUE, pending: false });
    mount();
    expect(mine.calls).toBe(0);
    act(() => openFeedback());
    await waitFor(() => expect(mine.calls).toBe(1));
    await user.click(await screen.findByRole('button', { name: /^Your reports · 1/ }));
    expect(screen.getByRole('dialog', { name: 'Your reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Issue #7: Older one/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
    // Closing and opening again does not fetch again.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(mine.calls).toBe(1);
    await user.type(box(), 'New one');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('dialog', { name: 'Thanks, it’s filed' });
    expect(mine.calls).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Your reports' }));
    expect(screen.getByRole('dialog', { name: 'Your reports' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Thanks, it’s filed' })).toBeInTheDocument();
  });

  it('C19-U16 Your reports that could not load says so, and Try again fetches again', async () => {
    const user = userEvent.setup();
    mine.answer = new Error('offline');
    mount();
    act(() => openFeedback());
    await waitFor(() => expect(mine.calls).toBe(1));
    // Unknown filing: the form still says public.
    expect(screen.getByRole('button', { name: 'Public on GitHub: what’s shared' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Your reports/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your reports');
    mine.answer = { filing: 'github', reports: [] };
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing sent yet')).toBeInTheDocument();
    expect(mine.calls).toBe(2);
  });
});
