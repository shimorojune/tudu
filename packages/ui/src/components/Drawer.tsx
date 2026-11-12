import { Dialog as RadixDialog } from 'radix-ui';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { escapeStepsBack } from './Dialog';

export interface DrawerProps {
  open: boolean;
  onClose?: () => void;
  /** Read out. */
  label: string;
  children?: ReactNode;
  /** 520px by default; tablets use 460. */
  width?: number | string;
  /** The phone page: slides in from the right edge, no veil. Put a back control in the content. */
  fullscreen?: boolean;
  /** `false` for panels you work alongside (Jira): no veil, the page stays live, Esc closes only from inside. */
  modal?: boolean;
  /**
   * A modeless drawer closes on a press anywhere else on the page (#62), and the press still does its own job.
   * `false` keeps it open. Modal drawers close on their veil either way.
   */
  closeOnOutside?: boolean;
  className?: string;
}

const LEAVE_MS = 190;

/**
 * Presses that are not "outside" a drawer: a toast (Undo on "Comment deleted") belongs to what the panel is doing, the
 * note window (chunk 22) floats over it, the Jira button in the top bar and the sidebar's Jira row toggle it (one
 * press closes it; closing first would reopen it on the click), and a panel holding `[data-keep-open]` is mid-step
 * (Jira checking a token).
 */
const STAYS = '.tp-toast-host, .tp-nb-float, .tp-jirabtn, [data-nav="app:Jira"]';
function stays(target: Element | null, panel: HTMLElement | null): boolean {
  if (target?.closest?.(STAYS)) return true;
  return !!panel?.querySelector('[data-keep-open]');
}
const FULL_LEAVE_MS = 260;

/**
 * A paper panel that opens over the page and never pushes or squeezes it. Slides 24px in and fades (dur-panel-in),
 * leaves faster (180ms). Esc steps back one layer: out of a field first, then the panel closes. Focus moves in
 * and returns when it closes. Modeless drawers sit under modal ones.
 */
export function Drawer({
  open,
  onClose,
  label,
  children,
  width,
  fullscreen,
  modal = true,
  closeOnOutside = true,
  className,
}: DrawerProps) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);

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
      fullscreen ? FULL_LEAVE_MS : LEAVE_MS,
    );
    return () => clearTimeout(t);
  }, [leaving, fullscreen]);

  if (!mounted) return null;
  const modeless = modal === false && !fullscreen;
  const w = width ? (typeof width === 'number' ? `${width}px` : width) : null;
  const style = w && !fullscreen ? ({ '--drawer-w': w } as CSSProperties) : undefined;

  return (
    <RadixDialog.Root
      open={mounted}
      modal={!modeless}
      onOpenChange={(next) => {
        if (!next) onClose?.();
      }}
    >
      <RadixDialog.Portal>
        <div
          className={cx(
            'tp-root tp-drawer-wrap',
            fullscreen && 'tp-full',
            modeless && 'tp-modeless',
            leaving && 'tp-leaving',
            className,
          )}
          data-state={leaving ? 'closing' : 'open'}
        >
          {fullscreen || modeless ? null : <RadixDialog.Overlay className="tp-drawer-veil" />}
          <RadixDialog.Content
            asChild
            aria-label={label}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              panel.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(e) => {
              // Radix would refocus its own Trigger, which we do not use: go back to where focus was when it opened,
              // unless it has since moved somewhere else (a modeless panel you worked beside).
              e.preventDefault();
              const active = document.activeElement;
              if (!active || active === document.body) opener.current?.focus({ preventScroll: true });
            }}
            onEscapeKeyDown={(e) => {
              if (modeless && panel.current && !panel.current.contains(document.activeElement)) {
                e.preventDefault();
                return;
              }
              if (escapeStepsBack(e.target)) {
                e.preventDefault();
                (e.target as HTMLElement).blur?.();
                return;
              }
              // A picker open somewhere in the panel closes itself on Esc; the panel stays.
              if (panel.current?.querySelector('.tp-td-pop:not(.tp-pop-leaving), .tp-rte-pop'))
                e.preventDefault();
            }}
            onFocusOutside={(e) => {
              // Focus moving away (Tab, a shortcut) never closes a panel you work beside: only a press does.
              if (modeless) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              const target = e.detail.originalEvent.target as Element | null;
              if (leaving || stays(target, panel.current) || (modeless && !closeOnOutside))
                e.preventDefault();
            }}
          >
            <section ref={panel} tabIndex={-1} className="tp-drawer tp-sheet" style={style}>
              {children}
            </section>
          </RadixDialog.Content>
          <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
          <RadixDialog.Description className="sr-only" />
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
