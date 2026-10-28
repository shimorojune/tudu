import { useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** A short serif question: "Leave Northwind?" */
  title: string;
  /** What will happen, in plain words. */
  children?: ReactNode;
  /** The ink button names the action: "Leave Northwind". Never a red button. */
  confirmLabel: string;
  cancelLabel?: string;
  /** Runs the action. May return a promise; the button spins until it settles. */
  onConfirm: () => void | Promise<void>;
  /** Called after the button has confirmed ("Done"), so the caller can close or move on. Defaults to onClose. */
  onDone?: () => void;
  busyLabel?: string;
  doneLabel?: string;
  /** The button stays off until this text is typed (the space's name before Delete). */
  typeToConfirm?: string;
  variant?: 'dialog' | 'sheet';
  inline?: boolean;
  /** For state boards: pre-typed text and a busy state (1 working, 2 done). */
  typed?: string;
  busy?: 0 | 1 | 2;
  /** For state boards: why it didn't happen. A rejected `onConfirm` shows its own message here. */
  error?: string;
}

const DONE_SHOWN_MS = 420;

/** Asks before something that can't be taken back. Delete asks you to type the name first. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    open,
    onClose,
    title,
    children,
    confirmLabel,
    cancelLabel = 'Cancel',
    onConfirm,
    onDone,
    busyLabel = 'Working…',
    doneLabel = 'Done',
    typeToConfirm,
    variant,
    inline,
  } = props;
  const [typed, setTyped] = useState(props.typed ?? '');
  const [busy, setBusy] = useState<0 | 1 | 2>(props.busy ?? 0);
  const [failed, setFailed] = useState<string | null>(props.error ?? null);

  // Each time it opens, start clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !inline) {
      setTyped('');
      setBusy(0);
      setFailed(null);
    }
  }

  const ok = !typeToConfirm || typed.trim() === typeToConfirm;

  async function go() {
    if (!ok || busy) return;
    setBusy(1);
    setFailed(null);
    try {
      await onConfirm();
    } catch (err) {
      setBusy(0);
      setFailed(err instanceof Error ? err.message : 'That didn’t work. Try again.');
      return;
    }
    setBusy(2);
    setTimeout(() => (onDone ?? onClose)(), DONE_SHOWN_MS);
  }

  const footer = (
    <>
      <span className="tp-cs-sp" />
      <Button variant="quiet" size="sm" onClick={onClose}>
        {cancelLabel}
      </Button>
      <Button
        size="sm"
        disabled={!ok}
        loading={busy === 1}
        loadingLabel={busyLabel}
        success={busy === 2}
        successLabel={doneLabel}
        onClick={() => void go()}
      >
        {confirmLabel}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      inline={inline}
      onClose={onClose}
      variant={variant}
      title={title}
      footer={footer}
      className="tp-cf"
      noFocus
    >
      <div className="tp-cf-b">{children}</div>
      {/* Why it didn't happen, under the ask; the button is ready to try again. */}
      {failed ? (
        <div className="tp-help tp-cf-err" role="alert">
          <Icon name="error" size={13} stroke={2.2} />
          {failed}
        </div>
      ) : null}
      {typeToConfirm ? (
        <label className="tp-cf-type">
          <span>
            Type <b>{typeToConfirm}</b> to confirm
          </span>
          <span className="tp-field">
            <input
              value={typed}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Type ${typeToConfirm} to confirm`}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void go();
              }}
            />
          </span>
        </label>
      ) : null}
    </Dialog>
  );
}
