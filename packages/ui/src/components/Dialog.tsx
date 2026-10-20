import { Dialog as RadixDialog } from 'radix-ui';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  /** Names it when there is no title (bare layouts). */
  label?: string;
  /** A quiet line under the title. */
  sub?: ReactNode;
  icon?: ReactNode;
  /** Buttons; a quiet line on the left. */
  footer?: ReactNode;
  children?: ReactNode;
  /** `md` 480px for forms; `lg` 900 × 640 for Settings. */
  size?: 'md' | 'lg';
  /** Drops the head and padding so a layout fills it. */
  bare?: boolean;
  /** On phones: rises from the bottom with a grabber. */
  variant?: 'dialog' | 'sheet';
  /** Draws the panel in place, without the veil (state boards, previews). */
  inline?: boolean;
  /** Leave focus where it is (previews). */
  noFocus?: boolean;
  className?: string;
}

const LEAVE_MS = 160;
const SHEET_LEAVE_MS = 230;

/** True when Escape should leave a field or an open picker before it closes the layer. */
export function escapeStepsBack(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], .tp-pop, .tp-qa-pop, .tp-td-pop');
}

// React 19 passes `ref` as a prop, so Radix's Slot can compose its ref with ours and reach the panel element.
// Everything else Radix merges in (id, labels, state, the pointer-events style, focus handlers) goes on the root too.
function DialogPanel({
  open: _open,
  label: _label,
  inline: _inline,
  noFocus: _noFocus,
  title,
  sub,
  icon,
  footer,
  children,
  size = 'md',
  bare,
  variant,
  onClose,
  className,
  ref,
  ...rest
}: DialogProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof DialogProps> & { ref?: React.Ref<HTMLDivElement> }) {
  const sheet = variant === 'sheet';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      {...rest}
      className={cx('tp-dlg', `tp-dlg-${size}`, sheet && 'tp-dlg-sheet', bare && 'tp-dlg-bare', className)}
    >
      {sheet ? <div className="tp-qa-grabber" aria-hidden="true" /> : null}
      {bare ? (
        children
      ) : (
        <>
          {title ? (
            <div className="tp-dlg-h">
              {icon ? <span className="tp-dlg-icon">{icon}</span> : null}
              <div className="tp-dlg-ht">
                <h2>{title}</h2>
                {sub ? <p>{sub}</p> : null}
              </div>
              {onClose ? (
                <IconButton label="Close" tipSide="bottom-end" onClick={onClose}>
                  <Icon name="x" size={16} />
                </IconButton>
              ) : null}
            </div>
          ) : null}
          <div className="tp-dlg-b">{children}</div>
          {footer ? <div className="tp-dlg-f">{footer}</div> : null}
        </>
      )}
    </div>
  );
}

/**
 * A calm modal over the page: a light veil, a paper panel that rises in (220ms) and eases out (150ms).
 * Esc steps out of a field first, then closes; a click on the veil closes. Focus moves in and returns when it closes.
 */
export function Dialog(props: DialogProps) {
  const { open, onClose, inline, noFocus, variant, title, label } = props;
  const sheet = variant === 'sheet';
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Opening mounts at once; closing keeps the panel while it eases out, then unmounts (see the timer below).
  if (open && (!mounted || leaving)) {
    setMounted(true);
    setLeaving(false);
  }
  if (!open && mounted && !leaving) setLeaving(true);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(
      () => {
        setMounted(false);
        setLeaving(false);
      },
      sheet ? SHEET_LEAVE_MS : LEAVE_MS,
    );
    return () => clearTimeout(t);
  }, [leaving, sheet]);

  if (inline) {
    return (
      <div className={cx('tp-root tp-dlg-inline', sheet && 'tp-dlg-inline-sheet')}>
        <DialogPanel {...props} />
      </div>
    );
  }
  if (!mounted) return null;

  return (
    <RadixDialog.Root
      open={mounted}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <RadixDialog.Portal>
        <div
          className={cx('tp-root tp-dlg-layer', sheet && 'tp-dlg-layer-sheet', leaving && 'tp-leaving')}
          data-state={leaving ? 'closing' : 'open'}
        >
          <RadixDialog.Overlay className="tp-dlg-veil" />
          <RadixDialog.Content
            asChild
            aria-label={label ?? title}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              if (!noFocus) panel.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(e) => {
              // Radix would refocus its own Trigger, which we do not use: go back to where focus was when it opened.
              e.preventDefault();
              const active = document.activeElement;
              if (!active || active === document.body) opener.current?.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(e) => {
              if (escapeStepsBack(e.target)) {
                e.preventDefault();
                (e.target as HTMLElement).blur?.();
              }
            }}
            onInteractOutside={(e) => {
              if (leaving) e.preventDefault();
            }}
          >
            <DialogPanel {...props} ref={panel} />
          </RadixDialog.Content>
          {title ? null : <RadixDialog.Title className="sr-only">{label ?? 'Dialog'}</RadixDialog.Title>}
          {title ? <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title> : null}
          <RadixDialog.Description className="sr-only">
            {typeof props.sub === 'string' ? props.sub : ''}
          </RadixDialog.Description>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
