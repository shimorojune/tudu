import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedbackKind } from '@tudu/core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';
import { FeedbackDialog, type FeedbackDialogProps, type FeedbackPhase } from './FeedbackDialog';

/** The dialog with its draft held, as the app holds it. */
function Form({
  onSend,
  phase = 'idle',
  ...more
}: { onSend?: () => void; phase?: FeedbackPhase } & Partial<FeedbackDialogProps>) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [text, setText] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [shotPublic, setShotPublic] = useState(false);
  const [details, setDetails] = useState(true);
  return (
    <FeedbackDialog
      open
      kind={kind}
      onKind={setKind}
      text={text}
      onText={setText}
      shot={shot}
      onShot={(f) => {
        // As the app does: each new screenshot comes in private.
        setShot(f);
        setShotPublic(false);
      }}
      shotPublic={shotPublic}
      onShotPublic={setShotPublic}
      details={details}
      onDetails={setDetails}
      detailsLine="Tudu 0.38.0, macOS, the Today page. Never your tasks."
      phase={phase}
      onSend={onSend}
      {...more}
    />
  );
}

const ISSUE = { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' };

/** A drag or paste with files, as the browser hands them over. */
function withFiles(type: string, files: File[]) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files } });
  Object.defineProperty(ev, 'clipboardData', { value: { files } });
  return ev;
}

const image = (name: string, kb: number) =>
  new File([new Uint8Array(kb * 1024)], name, { type: 'image/png' });
const box = () => screen.getByRole('textbox', { name: /^What (happened|would help)\?$/ });
const caption = () => document.querySelector('.tp-fb-shot figcaption')?.textContent ?? null;
const slotShown = () => !document.querySelector('.tp-fb-slot')!.classList.contains('tp-hide');

describe('FeedbackDialog (chunk 19)', () => {
  it('C19-U01 the kinds switch the question and keep the draft; Send is off with no words; Sending… and Sent', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { rerender } = render(<Form onSend={onSend} />);
    expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
    expect(screen.getAllByText('It goes straight to the people who make Tudu.')[0]).toBeVisible();
    expect(box()).toHaveAccessibleName('What happened?');
    expect(box()).toHaveAttribute('placeholder', 'What you did, what you expected, what happened instead.');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(box(), '   ');
    expect(send).toBeDisabled();
    await user.type(box(), 'The tick came back');
    await user.click(screen.getByRole('button', { name: 'An idea' }));
    expect(box()).toHaveAccessibleName('What would help?');
    expect(box()).toHaveAttribute('placeholder', 'What you’d like Tudu to do, and what it would save you.');
    expect(box()).toHaveValue('   The tick came back');
    expect(screen.getByRole('switch', { name: 'Include app details' })).toBeChecked();
    expect(screen.getByText('Tudu 0.38.0, macOS, the Today page. Never your tasks.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    rerender(<Form onSend={onSend} phase="sending" />);
    expect(screen.getByRole('button', { name: /Sending…/ })).toBeInTheDocument();
    rerender(<Form onSend={onSend} phase="sent" />);
    expect(screen.getByRole('button', { name: /Sent/ })).toBeInTheDocument();
    // Email only: no public notice anywhere.
    expect(screen.queryByRole('button', { name: /Public on GitHub/ })).toBeNull();

    // Filed as GitHub issues: the sub line says public, Send reads Filing…, the hints say what stays private.
    rerender(<Form onSend={onSend} filing="github" />);
    expect(
      screen.getAllByText('It’s filed as a public issue on GitHub, so you can follow it.')[0],
    ).toBeVisible();
    expect(screen.queryByText('It goes straight to the people who make Tudu.')).toBeNull();
    expect(box()).toHaveAttribute(
      'placeholder',
      'What you’d like Tudu to do, and what it would save you. Leave out anything private.',
    );
    expect(screen.getByText('Private unless you show it')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Public on GitHub: what’s shared' })).toBeInTheDocument();
    rerender(<Form onSend={onSend} filing="github" phase="sending" />);
    expect(screen.getByRole('button', { name: /Filing…/ })).toBeInTheDocument();
    expect(document.querySelector('.tp-fb')).toHaveClass('tp-busy');
  });

  it('C19-U10 Public on GitHub opens what’s shared; Esc and a click outside close it and keep the draft', async () => {
    const user = userEvent.setup();
    render(<Form filing="github" />);
    await user.type(box(), 'Drag puts it back');
    const pub = screen.getByRole('button', { name: 'Public on GitHub: what’s shared' });
    await user.click(pub);
    const pop = await screen.findByRole('dialog', { name: 'What’s shared' });
    expect(pub).toHaveAttribute('aria-expanded', 'true');
    expect(pop).toHaveTextContent('What you write');
    expect(pop).toHaveTextContent('App details, when switched on: version, system, page, window, theme');
    expect(pop).toHaveTextContent('Your name and email (so we can reply)');
    expect(pop).toHaveTextContent('The screenshot, only when you show it');
    expect(pop).toHaveTextContent('The screenshot, unless you show it');
    expect(pop).toHaveTextContent('Never sent anywhere: your tasks, notes, people or space names.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What’s shared' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Send feedback' })).toBeInTheDocument();
    await user.click(pub);
    await screen.findByRole('dialog', { name: 'What’s shared' });
    await user.click(box());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What’s shared' })).toBeNull());
    expect(box()).toHaveValue('Drag puts it back');
  });

  it('C19-U11 Filed: the number, the gist and the link; Copy copies and ticks; Open on GitHub and Done', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onOpenIssue = vi.fn();
    const onClose = vi.fn();
    const onReports = vi.fn();
    function Filed() {
      const [, setText] = useState('');
      return (
        <FeedbackDialog
          open
          kind="bug"
          text={'Dragging a task puts it back\nTwice now.'}
          onText={setText}
          shot={null}
          details
          detailsLine=""
          filing="github"
          phase="filed"
          issue={ISSUE}
          onOpenIssue={onOpenIssue}
          onClose={onClose}
          onReports={onReports}
        />
      );
    }
    render(<Filed />);
    expect(screen.getByRole('dialog', { name: 'Thanks, it’s filed' })).toBeInTheDocument();
    expect(document.querySelector('.tp-fb-num')).toHaveTextContent('#142Something’s wrong');
    expect(document.querySelector('.tp-fb-gist')).toHaveTextContent('Dragging a task puts it back');
    expect(screen.getByText('github.com/shimorojune/tudu/issues/142')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy the issue link' }));
    expect(writeText).toHaveBeenCalledWith(ISSUE.url);
    expect(await screen.findByRole('button', { name: 'Copied the issue link' })).toHaveClass('tp-ok');
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy the issue link' })).not.toHaveClass('tp-ok'),
      {
        timeout: 2000,
      },
    );
    await user.click(screen.getByRole('button', { name: 'Open on GitHub' }));
    expect(onOpenIssue).toHaveBeenCalledWith(ISSUE.url);
    await user.click(screen.getByRole('button', { name: 'Your reports' }));
    expect(onReports).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('C19-U12 Pending says the issue follows; an error line keeps the words and Send comes back', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const { rerender } = render(<Form filing="github" phase="pending" />);
    expect(screen.getByRole('dialog', { name: 'Thanks, it’s sent' })).toBeInTheDocument();
    expect(screen.getAllByText('The GitHub issue follows in a few minutes.')[0]).toBeVisible();
    expect(screen.getByText(/GitHub didn’t answer just now/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    rerender(<Form filing="github" onSend={onSend} />);
    await user.type(box(), 'The dock badge says 2');
    rerender(
      <Form
        filing="github"
        onSend={onSend}
        error="That’s a lot of reports in an hour. Your words are kept; send it a little later."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('That’s a lot of reports in an hour.');
    expect(box()).toHaveValue('The dock badge says 2');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('C19-U02 a screenshot by picker, by paste and by drop: the slot opens with name and size; × removes it; another replaces it', async () => {
    const user = userEvent.setup();
    render(<Form />);
    expect(slotShown()).toBe(false);
    await user.upload(screen.getByLabelText('Choose a screenshot'), image('Screenshot.png', 412));
    await waitFor(() => expect(caption()).toBe('Screenshot.png412 KB'));
    expect(slotShown()).toBe(true);
    expect(screen.getByRole('img', { name: 'Preview of Screenshot.png' })).toBeInTheDocument();
    // The picture fades in once it has read.
    await waitFor(() => expect(document.querySelector('.tp-fb-shot-img img')).not.toBeNull(), {
      timeout: 2000,
    });
    fireEvent.load(document.querySelector('.tp-fb-shot-img img')!);
    expect(document.querySelector('.tp-fb-shot-img')).toHaveClass('tp-ready');

    // A paste into the words replaces it; the browser's "image.png" reads as a pasted image.
    act(() => {
      box().dispatchEvent(withFiles('paste', [image('image.png', 3)]));
    });
    await waitFor(() => expect(caption()).toBe('Pasted image.png3 KB'));

    // × folds it away.
    await user.click(screen.getByRole('button', { name: 'Remove the screenshot' }));
    expect(slotShown()).toBe(false);
    await waitFor(() => expect(caption()).toBeNull(), { timeout: 2000 });

    // A drop onto the dialog.
    const drop = document.querySelector('.tp-fb-drop')!;
    act(() => {
      drop.dispatchEvent(withFiles('dragover', []));
    });
    expect(drop).toHaveClass('tp-over');
    act(() => {
      drop.dispatchEvent(withFiles('drop', [image('Board.png', 2048)]));
    });
    expect(drop).not.toHaveClass('tp-over');
    await waitFor(() => expect(caption()).toBe('Board.png2.0 MB'));
  });

  it('C19-U03 not an image, or over 10 MB: nothing attaches and the hint says why; the outline only while dragging', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Form />);
    const drop = document.querySelector('.tp-fb-drop')!;
    expect(drop).not.toHaveClass('tp-over');
    await user.upload(
      screen.getByLabelText('Choose a screenshot'),
      new File(['x'], 'notes.txt', { type: 'text/plain' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('That’s not an image. Add a screenshot or a photo.');
    expect(caption()).toBeNull();
    act(() => {
      drop.dispatchEvent(withFiles('dragover', []));
    });
    expect(drop).toHaveClass('tp-over');
    act(() => {
      drop.dispatchEvent(withFiles('drop', [image('Huge.png', 10 * 1024 + 1)]));
    });
    expect(drop).not.toHaveClass('tp-over');
    expect(screen.getByRole('status')).toHaveTextContent('That image is over 10 MB. Try a smaller one.');
    expect(caption()).toBeNull();
    // A good one clears the hint.
    await user.upload(screen.getByLabelText('Choose a screenshot'), image('Fine.png', 1));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('or paste or drop one')).toBeInTheDocument();
  });

  it('C19-U19 a screenshot brings "Show it on the public issue", off; on shows the Public pill, the ring and says so', async () => {
    const user = userEvent.setup();
    render(<Form filing="github" />);
    const row = () => screen.queryByRole('switch', { name: 'Show the screenshot on the public issue' });
    const fig = () => document.querySelector('.tp-fb-shot')!;
    const sub = () => document.querySelector('.tp-fb-sub')!;
    // No screenshot, no switch.
    expect(row()).toBeNull();
    await user.upload(screen.getByLabelText('Choose a screenshot'), image('Screenshot.png', 12));
    await waitFor(() => expect(row()).not.toBeNull());
    expect(row()).toHaveAttribute('aria-checked', 'false');
    expect(row()).toBeEnabled();
    expect(fig()).not.toHaveClass('tp-shown');
    expect(sub()).not.toHaveClass('tp-on');
    expect(sub()).toHaveTextContent('Private. Only the Tudu team sees it, with your report.');
    await user.click(row()!);
    expect(row()).toHaveAttribute('aria-checked', 'true');
    expect(fig()).toHaveClass('tp-shown');
    expect(sub()).toHaveClass('tp-on');
    expect(sub()).toHaveTextContent('Public. Anyone can see it on the GitHub issue.');
    expect(document.querySelector('.tp-fb-pill')).toHaveTextContent('Public');
    // Another screenshot comes in private again.
    act(() => {
      box().dispatchEvent(withFiles('paste', [image('Other.png', 3)]));
    });
    await waitFor(() => expect(caption()).toBe('Other.png3 KB'));
    expect(row()).toHaveAttribute('aria-checked', 'false');
    expect(fig()).not.toHaveClass('tp-shown');
    // A kind GitHub can't show keeps the row, off and disabled, saying why.
    act(() => {
      box().dispatchEvent(
        withFiles('paste', [new File([new Uint8Array(64)], 'IMG_2041.heic', { type: 'image/heic' })]),
      );
    });
    await waitFor(() => expect(caption()).toBe('IMG_2041.heic1 KB'));
    expect(row()).toBeDisabled();
    expect(row()).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByText('GitHub can’t show this kind of image. It stays with the team.'),
    ).toBeInTheDocument();
    await user.click(row()!);
    expect(row()).toHaveAttribute('aria-checked', 'false');
    expect(fig()).not.toHaveClass('tp-shown');
  });

  it('C19-U20 email only: a screenshot brings no switch and no pill; the hint is as before', async () => {
    const user = userEvent.setup();
    render(<Form filing="email" />);
    expect(screen.getByText('or paste or drop one')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Choose a screenshot'), image('Screenshot.png', 12));
    await waitFor(() => expect(caption()).toBe('Screenshot.png12 KB'));
    expect(screen.queryByRole('switch', { name: 'Show the screenshot on the public issue' })).toBeNull();
    expect(document.querySelector('.tp-fb-shot')).not.toHaveClass('tp-shown');
  });

  it('C19-U21 the hint by Add a screenshot says it’s private unless you show it', () => {
    render(<Form filing="github" />);
    expect(screen.getByText('Private unless you show it')).toBeInTheDocument();
    expect(screen.queryByText('Only the Tudu team sees it')).toBeNull();
  });

  it('C19-U01 the avatar menu has Send feedback between Settings and Sign out', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(
      <AccountMenu
        me={{ name: 'Rohit', initials: 'R' }}
        onSettings={() => {}}
        onFeedback={onFeedback}
        onSignOut={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'You: Rohit' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Settings',
      'Send feedback',
      'Sign out',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Send feedback' }));
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });
});
