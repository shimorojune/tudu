import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface ToastProps {
  /** Past tense: "Linked task added to Today". */
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}

/** A short confirmation with an optional action, on the dark toast surface. */
export function Toast({ children, action, onAction, className }: ToastProps) {
  return (
    <div className={cx('tp-root tp-toast', className)} role="status">
      <span>{children}</span>
      {action ? (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

export interface ToastOptions {
  action?: string;
  onAction?: () => void;
  /** How long it stays. With an action, dur-toast (4.5s); otherwise 1.8s. */
  duration?: number;
}

export const TOAST_WITH_ACTION_MS = 4500;
export const TOAST_PLAIN_MS = 1800;

interface ToastRecord extends ToastOptions {
  id: number;
  text: string;
}

type Listener = (t: ToastRecord | null) => void;
const listeners = new Set<Listener>();
let current: ToastRecord | null = null;
let seq = 0;

/** Show one quiet confirmation at the bottom centre; a new one replaces the old. Needs a ToastHost on the page. */
export function showToast(text: string, opts: ToastOptions = {}): void {
  current = { id: ++seq, text, ...opts };
  listeners.forEach((l) => l(current));
}

export function dismissToast(): void {
  current = null;
  listeners.forEach((l) => l(null));
}

/** Mount once, at the app root. Renders whatever showToast was last asked to show. */
export function ToastHost() {
  const [toast, setToast] = useState<ToastRecord | null>(current);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gone = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on: Listener = (t) => {
      if (timer.current) clearTimeout(timer.current);
      if (gone.current) clearTimeout(gone.current);
      setLeaving(false);
      setToast(t);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const stay = toast.duration ?? (toast.action ? TOAST_WITH_ACTION_MS : TOAST_PLAIN_MS);
    timer.current = setTimeout(() => leave(200), stay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  function leave(ms: number) {
    setLeaving(true);
    gone.current = setTimeout(() => {
      setToast((t) => (t && current && t.id === current.id ? ((current = null), null) : t));
      setLeaving(false);
    }, ms);
  }

  if (!toast) return <div className="tp-root tp-toast-host" role="status" aria-live="polite" />;
  return (
    <div className="tp-root tp-toast-host" role="status" aria-live="polite">
      <div key={toast.id} className={cx('tp-toast', leaving ? 'tp-toast-out' : 'tp-toast-in')}>
        <span>{toast.text}</span>
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              toast.onAction?.();
              leave(160);
            }}
          >
            {toast.action}
          </button>
        ) : null}
      </div>
    </div>
  );
}
