import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tudu/client';
import type { FeedbackReport, FeedbackSent, MyReports, SimilarIssue, SimilarIssues } from '@tudu/core';
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
// Similar reports, as GET /api/feedback/similar answers (#76); each look is kept with its words and signal.
const similar = vi.hoisted(() => ({
  answer: { issues: [] } as SimilarIssues | Error,
  looks: [] as Array<{ q: string; signal: AbortSignal | undefined }>,
}));
vi.mock('./session', () => ({
  api: {
    get: vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith('/api/feedback/similar')) {
        similar.looks.push({
          q: new URL(path, 'http://x').searchParams.get('q') ?? '',
          signal: init?.signal ?? undefined,
        });
        if (similar.answer instanceof Error) throw similar.answer;
        return similar.answer;
      }
      mine.calls++;
      if (mine.answer instanceof Error) throw mine.answer;
      return mine.answer;
    }),
  },
}));
const opened = vi.hoisted(() => [] as string[]);
vi.mock('./links', () => ({ openOutside: (url: string) => opened.push(url) }));

const ISSUE = { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' };
const JIRA: SimilarIssue = {
  number: 64,
  title: 'Jira count stuck at 1 with 2 assigned',
  url: 'https://github.com/shimorojune/tudu/issues/64',
  state: 'fixed',
  createdAt: '2026-10-24T10:00:00.000Z',
  closedAt: '2026-11-05T10:00:00.000Z',
  plusOnes: 2,
};

const report = (text = 'The tick came back'): FeedbackReport => ({
  id: crypto.randomUUID(),
  kind: 'bug',
  text,
  details: null,
  shotPublic: false,
  public: true,
  plusOneOf: null,
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
    // The choice to file it in public, and to show the screenshot there, waits with it.
    up = false;
    await q.submit(queued({ ...report('Fourth'), shotPublic: true, public: false }), false);
    up = true;
    await new FeedbackQueue(store, send).flush();
    expect(sent.at(-1)!.report).toMatchObject({ text: 'Fourth', shotPublic: true, public: false });
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
    similar.answer = { issues: [] };
    similar.looks = [];
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

  it('C19-U22 shotPublic follows public and the kind: a PNG on a public report goes public, a HEIC doesn’t, no shot is false', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    send.mockResolvedValue({ id: 'x', issue: ISSUE, pending: false });
    mount();
    act(() => openFeedback());
    await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' });
    const shot = (name: string, type = 'image/png') => new File([new Uint8Array(2048)], name, { type });
    expect(screen.queryByRole('switch', { name: 'Show the screenshot on the public issue' })).toBeNull();
    const sendWith = async (words: string, file: File | null) => {
      act(() => openFeedback());
      await user.type(box(), words);
      if (file) {
        await user.upload(screen.getByLabelText('Choose a screenshot'), file);
        await waitFor(() => expect(document.querySelector('.tp-fb-nm')).toHaveTextContent(file.name));
      }
      await user.click(screen.getByRole('button', { name: 'Send' }));
      await user.click(await screen.findByRole('button', { name: 'Done' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      return (send.mock.calls.at(-1)![0] as QueuedReport).report;
    };
    expect(await sendWith('Drag puts it back', shot('One.png'))).toMatchObject({
      public: true,
      shotPublic: true,
    });
    expect(await sendWith('Again on the phone', shot('IMG.heic', 'image/heic'))).toMatchObject({
      public: true,
      shotPublic: false,
    });
    expect(await sendWith('No shot this time', null)).toMatchObject({ public: true, shotPublic: false });
  });

  it('C19-U38 public off drops a picked +1 and stops similar looks; it holds through a close; a send starts the next one on', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    similar.answer = { issues: [JIRA] };
    send.mockResolvedValue({ id: 'x', issue: null, pending: false });
    mount();
    act(() => openFeedback());
    await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' });
    await user.type(box(), 'Jira count says 1');
    await user.click(await screen.findByRole('button', { name: '+1 #64 instead of a new issue' }));
    expect(screen.getByRole('button', { name: /\+1 on #64/ })).toBeInTheDocument();
    const sw = () => screen.getByRole('switch', { name: 'File it as a public issue' });
    expect(sw()).toBeChecked();
    await user.click(sw());
    expect(sw()).not.toBeChecked();
    expect(screen.getByRole('button', { name: /^Send$/ })).toBeInTheDocument();
    const looks = similar.looks.length;
    await user.type(box(), ' after a reload');
    await new Promise((r) => setTimeout(r, 600));
    expect(similar.looks).toHaveLength(looks);
    // Closed and opened again: still off, words kept.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(sw()).not.toBeChecked();
    expect(box()).toHaveValue('Jira count says 1 after a reload');
    await user.upload(
      screen.getByLabelText('Choose a screenshot'),
      new File([new Uint8Array(2048)], 'One.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(document.querySelector('.tp-fb-nm')).toHaveTextContent('One.png'));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((send.mock.calls[0]![0] as QueuedReport).report).toMatchObject({
      public: false,
      shotPublic: false,
      plusOneOf: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => openFeedback());
    expect(sw()).toBeChecked();
  });

  it('C19-U32 similar looks: none under three words; one 450ms after the last key; a newer look aborts the older; rows stay dimmed while the next comes', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    similar.answer = { issues: [JIRA] };
    mount();
    act(() => openFeedback());
    await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' });
    await user.type(box(), 'Jira count');
    await new Promise((r) => setTimeout(r, 600));
    expect(similar.looks).toHaveLength(0);
    await user.type(box(), ' wrong');
    // Not while the keys are coming; then once.
    expect(similar.looks).toHaveLength(0);
    await waitFor(() => expect(similar.looks).toHaveLength(1));
    expect(similar.looks[0]!.q).toBe('Jira count wrong');
    expect(await screen.findByText('Already reported?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 #64 instead of a new issue' })).toBeInTheDocument();
    // The next look keeps the rows, dimmed, until it answers.
    let answer!: (v: SimilarIssues) => void;
    const { api } = await import('./session');
    (api.get as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (path: string, init?: RequestInit) =>
        new Promise((done) => {
          similar.looks.push({
            q: new URL(path, 'http://x').searchParams.get('q') ?? '',
            signal: init?.signal ?? undefined,
          });
          answer = done;
        }),
    );
    await user.type(box(), ' in the sidebar');
    await waitFor(() => expect(similar.looks).toHaveLength(2));
    expect(screen.getByRole('list', { name: 'Similar reports' })).toHaveClass('tp-stale');
    // A newer look before it answers aborts it.
    similar.answer = { issues: [] };
    await user.type(box(), ' today');
    await waitFor(() => expect(similar.looks).toHaveLength(3));
    expect(similar.looks[1]!.signal?.aborted).toBe(true);
    act(() => answer({ issues: [JIRA] }));
    // The newest answer (nothing close) wins: the box folds shut.
    await waitFor(() => expect(screen.getByTestId('similar-reports')).toHaveClass('tp-hide'));
  });

  it('C19-U33 a +1 goes as plusOneOf and says it’s on #64; a 409 clears the pick and keeps the words; a queued +1 keeps it, and goes as new if refused', async () => {
    const user = userEvent.setup();
    mine.answer = { filing: 'github', reports: [] };
    similar.answer = { issues: [JIRA] };
    send.mockRejectedValueOnce(
      new ApiError(409, 'That issue can’t take comments now. Send it as a new report instead.'),
    );
    send.mockResolvedValueOnce({
      id: 'x',
      issue: { number: 64, url: 'https://github.com/shimorojune/tudu/issues/64#issuecomment-1' },
      pending: false,
    });
    mount();
    act(() => openFeedback());
    await screen.findByRole('button', { name: 'Public on GitHub: what’s shared' });
    await user.type(box(), 'Jira count says 1');
    await user.click(await screen.findByRole('button', { name: '+1 #64 instead of a new issue' }));
    await user.click(screen.getByRole('button', { name: /\+1 on #64/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((send.mock.calls[0]![0] as QueuedReport).report.plusOneOf).toBe(64);
    expect(
      await screen.findByText('That issue can’t take comments now. Send it as a new report instead.'),
    ).toBeInTheDocument();
    expect(box()).toHaveValue('Jira count says 1');
    expect(screen.getByRole('button', { name: /^Send$/ })).toBeInTheDocument();
    // Picked again (the issue took comments again): it goes on, and the form says so.
    await user.click(screen.getByRole('button', { name: '+1 #64 instead of a new issue' }));
    await user.click(screen.getByRole('button', { name: /\+1 on #64/ }));
    expect(await screen.findByRole('dialog', { name: 'Thanks, it’s on #64' })).toBeInTheDocument();

    // Queued offline, the pick waits with it; if the issue can't take it by then, it goes as a new report.
    const store = new MemoryFeedbackStore();
    const sent: QueuedReport[] = [];
    const later = vi.fn(async (q: QueuedReport) => {
      sent.push(q);
      if (q.report.plusOneOf != null) throw new ApiError(409, 'no');
      return { id: 'y', issue: ISSUE, pending: false };
    });
    const q = new FeedbackQueue(store, later);
    await q.submit(queued({ ...report('Queued +1'), plusOneOf: 64 }), false);
    expect((await store.all())[0]!.report.plusOneOf).toBe(64);
    await new FeedbackQueue(store, later).flush();
    expect(sent.map((x) => x.report.plusOneOf)).toEqual([64, null]);
    expect(await store.all()).toHaveLength(0);
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
