import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FeedbackKind } from '@tudu/core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';
import { FeedbackDialog, type FeedbackPhase } from './FeedbackDialog';

/** The dialog with its draft held, as the app holds it. */
function Form({ onSend, phase = 'idle' }: { onSend?: () => void; phase?: FeedbackPhase }) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [text, setText] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [details, setDetails] = useState(true);
  return (
    <FeedbackDialog
      open
      kind={kind}
      onKind={setKind}
      text={text}
      onText={setText}
      shot={shot}
      onShot={setShot}
      details={details}
      onDetails={setDetails}
      detailsLine="Tudu 0.38.0, macOS, the Today page. Never your tasks."
      phase={phase}
      onSend={onSend}
    />
  );
}

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
