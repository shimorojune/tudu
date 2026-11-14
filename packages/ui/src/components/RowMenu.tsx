import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { prefersReducedMotion } from '../lib/hooks';
import { Icon } from '../lib/icons';
import type { RowMenuAct, RowMenuEntry, RowMenuItem } from '../lib/rowMenu';

/** How long the menu eases out. */
export const ROW_MENU_LEAVE_MS = 130;
/** A hover waits this long before a submenu opens, and longer (SWAP) before an open one changes. */
export const ROW_MENU_HOVER_MS = 60;
export const ROW_MENU_SWAP_MS = 120;
/** A swipe down this far closes the touch sheet. */
export const ROW_SHEET_SWIPE_PX = 60;
/** How long the touch sheet takes to go. */
export const ROW_SHEET_LEAVE_MS = 220;

/** Why the menu went: the list puts focus back on the row after a key or a pick. */
export type RowMenuCloseWhy = 'pick' | 'key' | 'away';

export interface RowMenuProps {
  entries: RowMenuEntry[];
  /** The pointer, in viewport px. The menu grows from this corner and flips at the window's edges. */
  x: number;
  y: number;
  /** Opened from the keyboard: the first item takes the focus. */
  keyboard?: boolean;
  label?: string;
  onPick: (act: RowMenuAct) => void;
  /** It has gone (after its fade). Not called when a right-click elsewhere replaces it: see `onReplace`. */
  onClose: (why: RowMenuCloseWhy) => void;
}

function Tick() {
  return (
    <svg
      className="tp-ctx-tick"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.4 9.8 17.2 19.2 6.8" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      className="tp-ctx-chev"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface ListProps {
  items: RowMenuEntry[];
  label: string;
  /** The main menu: the pointer. A submenu: its parent item's box. */
  at: { x: number; y: number } | { parent: DOMRect };
  openKey?: string | null;
  focusFirst?: boolean;
  leaving: boolean;
  onPick: (it: RowMenuItem) => void;
  onHover?: (it: RowMenuItem | null, rect: DOMRect | null, fromKeys: boolean) => void;
  onOpenSub?: (it: RowMenuItem, rect: DOMRect, fromKeys: boolean) => void;
  onBack?: () => void;
  onEscape: () => void;
}

function CtxList(p: ListProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const sub = 'parent' in p.at;
  const ax = 'parent' in p.at ? p.at.parent.right : p.at.x;
  const ay = 'parent' in p.at ? p.at.parent.top : p.at.y;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    let flipX = false;
    let flipY = false;
    if ('parent' in p.at) {
      const r = p.at.parent;
      left = r.right - 2;
      top = r.top - 6;
      if (left + w > vw - 8) {
        left = r.left - w + 2;
        flipX = true;
      }
      top = Math.max(8, Math.min(top, vh - h - 8));
    } else {
      const { x, y } = p.at;
      left = x + 2;
      top = y + 2;
      if (left + w > vw - 8) {
        left = Math.max(8, x - w - 2);
        flipX = true;
      }
      if (top + h > vh - 8) {
        top = Math.max(8, y - h - 2);
        flipY = true;
      }
    }
    setPos({ left, top, origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}` });
    // Only a new place moves it; the items never change its size while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ax, ay]);

  // Focus once the menu is placed: until then it is `visibility: hidden`, and a browser refuses focus to a hidden
  // element without a word.
  const focused = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !pos || focused.current) return;
    focused.current = true;
    // From the keyboard the first item takes the focus; from the pointer the menu itself does, so ↑↓ still work.
    const first = p.focusFirst
      ? el.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')
      : sub
        ? null
        : el;
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(':scope > [role^="menuitem"]')).filter(
      (b) => b.getAttribute('aria-disabled') !== 'true',
    );
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!items.length) return;
      const n = items.length;
      const j = i < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      items[j]!.focus();
      p.onHover?.(null, null, true);
    } else if (e.key === 'ArrowLeft' && sub) {
      e.preventDefault();
      e.stopPropagation();
      p.onBack?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      p.onEscape();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  }

  const style = pos
    ? { left: pos.left, top: pos.top, transformOrigin: pos.origin }
    : { left: -9999, top: 0, visibility: 'hidden' as const };
  return (
    <div
      ref={ref}
      className={cx('tp-root tp-ctx tp-menu', sub && 'tp-ctx-sub', p.leaving && 'tp-ctx-leaving')}
      role="menu"
      aria-label={p.label}
      tabIndex={-1}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {p.items.map((it, i) => {
        if (it === 'sep') return <div key={`s${i}`} className="tp-ctx-sep" role="separator" />;
        const open = p.openKey === it.key;
        const radio = it.checked !== undefined;
        return (
          <button
            key={it.key}
            data-k={it.key}
            type="button"
            tabIndex={-1}
            role={radio ? 'menuitemradio' : 'menuitem'}
            aria-checked={radio ? (it.checked ? 'true' : 'false') : undefined}
            aria-disabled={it.disabled ? 'true' : undefined}
            aria-haspopup={it.sub ? 'menu' : undefined}
            aria-expanded={it.sub ? (open ? 'true' : 'false') : undefined}
            className={cx(
              'tp-mi tp-ctx-mi',
              it.danger && 'tp-mi-danger',
              it.sub && 'tp-ctx-parent',
              open && 'tp-ctx-open',
              it.disabled && 'tp-ctx-off',
              it.checked && 'tp-ctx-checked',
            )}
            onMouseEnter={(e) => p.onHover?.(it, e.currentTarget.getBoundingClientRect(), false)}
            onKeyDown={(e) => {
              if (it.sub && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                e.stopPropagation();
                p.onOpenSub?.(it, e.currentTarget.getBoundingClientRect(), true);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (it.disabled) return;
              if (it.sub) {
                p.onOpenSub?.(it, e.currentTarget.getBoundingClientRect(), e.detail === 0);
                return;
              }
              p.onPick(it);
            }}
          >
            {it.dot ? <i className="tp-dot tp-ctx-dot" style={{ background: it.dot }} /> : null}
            <span className="tp-ctx-l">{it.label}</span>
            {it.checked ? (
              <span className="tp-ctx-ok">
                <Tick />
              </span>
            ) : it.hint ? (
              <span className="tp-ctx-hint">{it.hint}</span>
            ) : null}
            {it.sub ? <Chevron /> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The menu a right-click (or Shift+F10) opens on a task row: the same Tudu Paper menu in the browser and the Mac app.
 * It opens at the pointer, flips at the window's edges, opens submenus beside it on hover, → or Enter, and goes on
 * Esc, a click elsewhere, a scroll, a resize or leaving the window. A right-click anywhere outside it removes it at
 * once (no fade), so the list can open the next one on the row that was right-clicked.
 */
export function RowMenu(p: RowMenuProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [subRect, setSubRect] = useState<DOMRect | null>(null);
  const [subFocus, setSubFocus] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const gone = useRef(false);
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(p);
  useLayoutEffect(() => {
    latest.current = p;
  });

  function close(why: RowMenuCloseWhy, then?: () => void) {
    if (gone.current) return;
    gone.current = true;
    if (hover.current) clearTimeout(hover.current);
    const finish = () => {
      latest.current.onClose(why);
      then?.();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    setLeaving(true);
    timer.current = setTimeout(finish, ROW_MENU_LEAVE_MS);
  }

  useEffect(() => {
    const inside = (e: Event) => !!(e.target as Element | null)?.closest?.('.tp-ctx');
    // A right-button press is left to the contextmenu event below.
    const away = (e: PointerEvent) => {
      if (e.button !== 2 && !inside(e)) close('away');
    };
    const again = (e: MouseEvent) => {
      if (inside(e) || gone.current) return;
      gone.current = true;
      latest.current.onClose('away');
    };
    const scroll = (e: Event) => {
      if (!inside(e)) close('away');
    };
    const quit = () => close('away');
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('contextmenu', again, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', quit);
    window.addEventListener('resize', quit);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('contextmenu', again, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', quit);
      window.removeEventListener('resize', quit);
      if (hover.current) clearTimeout(hover.current);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function pick(it: RowMenuItem) {
    if (!it.act || it.checked) {
      close('pick');
      return;
    }
    const act = it.act;
    close('pick', () => latest.current.onPick(act));
  }

  function onHover(it: RowMenuItem | null, rect: DOMRect | null, fromKeys: boolean) {
    if (hover.current) clearTimeout(hover.current);
    if (fromKeys) return;
    // A short wait before a submenu opens or swaps, so a diagonal move toward the open one doesn't snap it shut.
    hover.current = setTimeout(
      () => {
        if (it?.sub && rect) {
          setOpenKey(it.key);
          setSubRect(rect);
          setSubFocus(false);
        } else setOpenKey(null);
      },
      openKey ? ROW_MENU_SWAP_MS : ROW_MENU_HOVER_MS,
    );
  }

  const open = openKey
    ? p.entries.find((e): e is RowMenuItem => e !== 'sep' && e.key === openKey)
    : undefined;
  const label = p.label ?? 'Task actions';
  let sub: ReactNode = null;
  if (open?.sub && subRect)
    sub = (
      <CtxList
        key={open.key}
        items={open.sub}
        label={open.label}
        at={{ parent: subRect }}
        focusFirst={subFocus}
        leaving={leaving}
        onPick={pick}
        onHover={() => {
          if (hover.current) clearTimeout(hover.current);
        }}
        onBack={() => {
          const k = openKey;
          setOpenKey(null);
          document.querySelector<HTMLElement>(`.tp-ctx [data-k="${k}"]`)?.focus();
        }}
        onEscape={() => close('key')}
      />
    );
  return createPortal(
    <>
      <CtxList
        items={p.entries}
        label={label}
        at={{ x: p.x, y: p.y }}
        openKey={openKey}
        focusFirst={!!p.keyboard}
        leaving={leaving}
        onPick={pick}
        onHover={onHover}
        onOpenSub={(it, rect, fromKeys) => {
          if (hover.current) clearTimeout(hover.current);
          setOpenKey(it.key);
          setSubRect(rect);
          setSubFocus(fromKeys);
        }}
        onEscape={() => close('key')}
      />
      {sub}
    </>,
    document.body,
  );
}

export interface RowSheetProps {
  entries: RowMenuEntry[];
  title: string;
  /** "ME-41 · Northwind" under the title. */
  byline?: string;
  /** The task's project colour, for the Project row's dot. */
  projectColor?: string;
  onPick: (act: RowMenuAct) => void;
  onClose: () => void;
}

const icons: Record<string, ReactNode> = {
  open: <Icon name="right" size={16} />,
  link: <Icon name="link" size={16} />,
  id: <Icon name="copy" size={16} />,
  del: <Icon name="trash" size={16} />,
};

/**
 * The row menu for touch: a press and hold on a row, let go, and this sheet rises from the bottom. The same actions as
 * the menu: moving and the due date are chips, Project opens its list on a second page with Back.
 */
export function RowSheet(p: RowSheetProps) {
  const [page, setPage] = useState<'main' | 'project'>('main');
  const swipe = useRef<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const gone = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(p);
  useLayoutEffect(() => {
    latest.current = p;
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, []);

  function close(then?: () => void) {
    if (gone.current) return;
    gone.current = true;
    const finish = () => {
      latest.current.onClose();
      then?.();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    setLeaving(true);
    timer.current = setTimeout(finish, ROW_SHEET_LEAVE_MS);
  }
  function act(it: RowMenuItem) {
    if (!it.act || it.checked || it.disabled) return;
    const a = it.act;
    close(() => latest.current.onPick(a));
  }

  const items = p.entries.filter((e): e is RowMenuItem => e !== 'sep');
  const byKey = (k: string) => items.find((x) => x.key === k);
  const subItems = (it?: RowMenuItem) => (it?.sub ?? []).filter((e): e is RowMenuItem => e !== 'sep');
  const chipWords: Record<string, string> = {
    'm-pick': 'Pick a day',
    'd-pick': 'Pick a date',
    'd-clear': 'Remove',
  };
  // Backlog sits with the other days on a phone: Today, Tomorrow, Backlog, then Pick a day.
  const chipOrder = (k: string) => (k === 'm-bl' ? 2.5 : 0);
  function chips(it?: RowMenuItem) {
    if (!it) return null;
    const list = subItems(it)
      .map((c, i) => ({ c, o: i + chipOrder(c.key) }))
      .sort((a, b) => a.o - b.o)
      .map((x) => x.c);
    return (
      <div className="tp-ctxs-sec">
        <div className="tp-ctxs-eb">{it.key === 'due' && it.hint ? `Due · ${it.hint}` : it.label}</div>
        <div className="tp-ctxs-chips">
          {list.map((c) => (
            <button
              key={c.key}
              type="button"
              className={cx('tp-ctxs-chip', c.checked && 'tp-on')}
              aria-pressed={c.checked ? 'true' : 'false'}
              disabled={c.checked || undefined}
              onClick={() => act(c)}
            >
              {chipWords[c.key] ?? c.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  function row(
    it: RowMenuItem | undefined,
    icon: ReactNode,
    opts: { go?: () => void; danger?: boolean } = {},
  ) {
    if (!it) return null;
    return (
      <button
        key={it.key}
        type="button"
        className={cx('tp-ctxs-row', (opts.danger || it.danger) && 'tp-ctxs-danger')}
        onClick={opts.go ?? (() => act(it))}
      >
        <span className="tp-ctxs-ic" aria-hidden="true">
          {icon}
        </span>
        <span className="tp-ctxs-l">{it.label}</span>
        {opts.go ? <span className="tp-ctxs-hint">{it.hint || 'None'}</span> : null}
        {opts.go ? <Chevron /> : null}
      </button>
    );
  }
  function group(nodes: ReactNode[]) {
    const kept = nodes.filter(Boolean);
    return kept.length ? <div className="tp-ctxs-grp">{kept}</div> : null;
  }

  const project = byKey('project');
  const main = (
    <div className="tp-ctxs-page" aria-hidden={page !== 'main' || undefined}>
      <div className="tp-ctxs-head">
        <div className="tp-ctxs-t">{p.title}</div>
        {p.byline ? <div className="tp-ctxs-by">{p.byline}</div> : null}
      </div>
      {group([row(byKey('toggle'), <Tick />), row(byKey('open'), icons.open)])}
      {chips(byKey('move'))}
      {chips(byKey('due'))}
      {group([
        row(project, <i className="tp-dot" style={{ background: p.projectColor ?? 'var(--ghost)' }} />, {
          go: () => setPage('project'),
        }),
        row(byKey('link'), icons.link),
        row(byKey('id'), icons.id),
      ])}
      {group([row(byKey('del'), icons.del)])}
    </div>
  );
  const projPage = project ? (
    <div className="tp-ctxs-page" aria-hidden={page !== 'project' || undefined}>
      <div className="tp-ctxs-bar">
        <button type="button" className="tp-ctxs-back" onClick={() => setPage('main')}>
          <Icon name="left" size={16} />
          Back
        </button>
        <span>Project</span>
      </div>
      <div className="tp-ctxs-grp">
        {subItems(project).map((c) => (
          <button
            key={c.key}
            type="button"
            className={cx('tp-ctxs-row', c.checked && 'tp-on')}
            disabled={c.disabled || undefined}
            aria-pressed={c.act ? (c.checked ? 'true' : 'false') : undefined}
            onClick={() => act(c)}
          >
            <span className="tp-ctxs-ic" aria-hidden="true">
              {c.act ? <i className="tp-dot" style={{ background: c.dot ?? 'var(--ghost)' }} /> : null}
            </span>
            <span className="tp-ctxs-l">{c.label}</span>
            {c.checked ? (
              <span className="tp-ctxs-ok">
                <Tick />
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return createPortal(
    <div className={cx('tp-root tp-sswsheet tp-ctxs-wrap', leaving && 'tp-leaving')}>
      <div className="tp-sswsheet-veil" onClick={() => close()} />
      <div
        className="tp-sswsheet-p tp-ctxs"
        role="dialog"
        aria-modal="true"
        aria-label={`Task actions: ${p.title}`}
        onPointerDown={(e) => {
          swipe.current = e.pointerType === 'mouse' ? null : e.clientY;
        }}
        onPointerMove={(e) => {
          if (swipe.current !== null && e.clientY - swipe.current > ROW_SHEET_SWIPE_PX) {
            swipe.current = null;
            close();
          }
        }}
        onPointerUp={() => {
          swipe.current = null;
        }}
      >
        <div className="tp-qa-grabber" aria-hidden="true" />
        <div className={cx('tp-ctxs-track', page === 'project' && 'tp-ctxs-on2')}>
          {main}
          {projPage}
        </div>
      </div>
    </div>,
    document.body,
  );
}
