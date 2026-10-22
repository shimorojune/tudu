import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isRefLike, searchTokens } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';
import { SearchHit, type SearchItem } from './SearchHit';
import { Skeleton } from './Skeleton';

/** What the app found for the words: the words they answer, and the rows. */
export interface SearchResults {
  query: string;
  hits: SearchItem[];
}

export interface SearchPanelProps {
  /** Over the page (the dialog on the desk, the sheet on phones). */
  open?: boolean;
  variant?: 'dialog' | 'sheet';
  /** `none`: no veil and no layer, the panel sits in the page (the kit). */
  layer?: 'overlay' | 'none';
  /** The results for the latest words the app has answered; the rows stay while the next answer comes. */
  results?: SearchResults | null;
  /** The first answer is on its way: skeleton rows. */
  loading?: boolean;
  /** The search could not run (offline, the server away): one quiet line, with Try again. */
  error?: boolean;
  onRetry?: () => void;
  /** Tasks you opened lately, for an empty box. */
  recent?: SearchItem[];
  /** Searches you made before, newest first, for an empty box. */
  history?: string[];
  onClearHistory?: () => void;
  /** The words change: the app searches. */
  onQuery?: (q: string) => void;
  /** A search that led somewhere (a pick or Create). */
  onSearched?: (q: string) => void;
  onPick?: (item: SearchItem) => void;
  onCreate?: (title: string) => void;
  onClose?: () => void;
  /**
   * Close matches (by meaning): asked a moment after the words stop changing, listed under their own heading
   * below the word matches; the word matches never wait for them. A rejected promise shows the quiet line.
   */
  similar?: (q: string) => Promise<SearchItem[]>;
  /** How long after the last key the close matches are asked for (260ms). */
  similarDelay?: number;
  similarLabel?: string;
  /** Reopening brings the last search back, selected (on by default). */
  keepLast?: boolean;
  placeholder?: string;
  hint?: string;
  historyLabel?: string;
  recentLabel?: string;
  /** The panel's own height limit, in px (440 by default). */
  maxHeight?: number;
  /** The kit: start in a state. */
  initial?: {
    query?: string;
    active?: number;
    noFocus?: boolean;
    /** The kit: close matches in a state, with these rows when done. */
    similarState?: 'loading' | 'done' | 'error';
    similar?: SearchItem[];
  };
  id?: string;
  className?: string;
}

export const SP_LEAVE_MS = 150;
export const SP_LEAVE_PHONE_MS = 220;
/** Close matches are asked for this long after the words stop changing. */
export const SP_SIMILAR_AFTER_MS = 260;

type SimState = 'off' | 'loading' | 'done' | 'error';
interface Sim {
  q: string;
  state: SimState;
  items: SearchItem[];
}
const SIM_OFF: Sim = { q: '', state: 'off', items: [] };

type Opt =
  | { kind: 'query'; q: string }
  | { kind: 'create' }
  | { kind: 'task'; it: SearchItem }
  | { kind: 'similar'; it: SearchItem };

function optKey(o: Opt): string {
  return o.kind === 'create'
    ? 'create'
    : o.kind === 'query'
      ? `q:${o.q}`
      : o.kind === 'similar'
        ? `s:${o.it.key}`
        : o.it.key;
}

/**
 * One box that searches your tasks, best match first. Before you type: your recent searches and the tasks you
 * opened lately. With no match it offers to create a task with those words. `dialog` on the desk and tablets (a
 * panel over the page), `sheet` on phones (a full-height sheet).
 */
export function SearchPanel(p: SearchPanelProps) {
  const phone = p.variant === 'sheet';
  const overlay = p.layer !== 'none';
  const init = p.initial ?? {};
  const open = overlay ? !!p.open : true;
  const [q, setQ] = useState(init.query ?? '');
  const [act, setAct] = useState(init.active ?? 0);
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // How many times it has opened, the last search that led somewhere, and whether this opening brought it back.
  const [opens, setOpens] = useState(open ? 1 : 0);
  const [lastQ, setLastQ] = useState('');
  const [restored, setRestored] = useState(false);
  const live = useRef(p);
  useLayoutEffect(() => {
    live.current = p;
  });
  const ql = q.trim().toLowerCase();
  const toks = searchTokens(ql);
  // Handlers ask for focus through state, so none of them touches the input's ref while rows are being drawn.
  const [focusAsk, setFocusAsk] = useState(0);
  const focusInput = () => setFocusAsk((n) => n + 1);
  useEffect(() => {
    if (focusAsk) input.current?.focus({ preventScroll: true });
  }, [focusAsk]);
  const uid = p.id ?? 'tp-sp';

  // Opening: a box ready to type in; the second time on, the last search that led somewhere comes back, selected.
  // Closing: the panel leaves; the next opening is fresh unless a search was kept.
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) {
      setLeaving(false);
      setMounted(true);
      if (overlay) {
        const back = opens ? (p.keepLast === false ? '' : lastQ) : (init.query ?? '');
        setOpens(opens + 1);
        setRestored(!!back && opens > 0);
        setQ(back);
        setAct(init.active ?? 0);
      }
    } else if (overlay) setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    timer.current = setTimeout(
      () => {
        setMounted(false);
        setLeaving(false);
      },
      phone ? SP_LEAVE_PHONE_MS : SP_LEAVE_MS,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [leaving, phone]);
  useEffect(() => {
    if (!mounted || !open) return;
    const t = setTimeout(
      () => {
        if (!input.current || (init.noFocus && opens <= 1)) return;
        input.current.focus({ preventScroll: true });
        if (restored) input.current.select();
      },
      overlay ? 30 : 0,
    );
    if (!overlay) return () => clearTimeout(t);
    function key(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.stopPropagation();
        live.current.onClose?.();
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first opening's focus rule is read once
  }, [mounted, open, overlay]);

  // The words change: the app searches, and the first row is the one to land on.
  const firstQ = useRef(true);
  const seenQl = useRef(ql);
  useEffect(() => {
    if (firstQ.current) {
      firstQ.current = false;
      if (!overlay) live.current.onQuery?.(ql);
      return;
    }
    if (seenQl.current === ql) return;
    seenQl.current = ql;
    live.current.onQuery?.(ql);
    setAct(0);
  }, [ql, overlay]);
  useEffect(() => {
    if (!overlay || !open) return;
    live.current.onQuery?.(ql);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on opening, the app searches the words shown
  }, [open, overlay]);

  // Close matches: a moment after the words settle, the app is asked for tasks that mean them. A task ID or Jira
  // key typed in full is a lookup, not a topic, and skips them. The word matches never wait for them.
  const [sim, setSim] = useState<Sim>(() =>
    init.similarState
      ? { q: (init.query ?? '').trim().toLowerCase(), state: init.similarState, items: init.similar ?? [] }
      : SIM_OFF,
  );
  const simDelay = p.similarDelay ?? SP_SIMILAR_AFTER_MS;
  useEffect(() => {
    // Nothing to ask: the state is simply not for these words (simOn reads it against ql).
    if (init.similarState || !p.similar || !ql || isRefLike(ql) || (overlay && !open)) return;
    let on = true;
    const t = setTimeout(() => {
      setSim({ q: ql, state: 'loading', items: [] });
      Promise.resolve()
        .then(() => live.current.similar!(ql))
        .then(
          (items) => {
            if (on) setSim({ q: ql, state: 'done', items: items ?? [] });
          },
          () => {
            if (on) setSim({ q: ql, state: 'error', items: [] });
          },
        );
    }, simDelay);
    return () => {
      on = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `similar` is read live; only the words and the delay matter
  }, [ql, simDelay, !!p.similar, open, overlay, init.similarState]);

  // The list eases to its new height as results change; past the panel's limit it scrolls.
  useEffect(() => {
    const w = wrap.current;
    const n = inner.current;
    if (!w || !n || phone) return;
    const fit = () => {
      w.style.height = `${n.offsetHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(n);
    return () => ro.disconnect();
  }, [mounted, phone]);

  const results = p.results ?? null;
  const fresh = !!results && results.query === ql;
  const hits = ql && results ? results.hits : [];
  const recent = !ql ? (p.recent ?? []) : [];
  const past = !ql ? (p.history ?? []).slice(0, 5) : [];
  const waiting = !!ql && !results && !p.error;
  const showLoading = !!p.loading || waiting;

  // Everything you can land on, in order, for the arrow keys.
  const opts: Opt[] = [];
  if (!ql) {
    for (const x of past) opts.push({ kind: 'query', q: x });
    for (const it of recent) opts.push({ kind: 'task', it });
  } else if (fresh && !hits.length && !p.error) opts.push({ kind: 'create' });
  if (ql) for (const it of hits) opts.push({ kind: 'task', it });
  // Close matches for these very words, never a task already listed above.
  const simOn = !!ql && !isRefLike(ql) && sim.state !== 'off' && sim.q === ql;
  const simItems = simOn ? sim.items.filter((it) => !hits.some((h) => h.key === it.key)) : [];
  if (simOn && sim.state === 'done') for (const it of simItems) opts.push({ kind: 'similar', it });
  const cur = Math.min(act, Math.max(0, opts.length - 1));

  // A search that led somewhere is kept: the box remembers it for the next opening, and the app adds it to the history.
  const pick = (o: Opt | undefined) => {
    if (!o) return;
    if (o.kind === 'query') {
      setQ(o.q);
      setAct(0);
      focusInput();
      return;
    }
    const t = q.trim();
    if (t) {
      setLastQ(t);
      p.onSearched?.(t);
    }
    if (o.kind === 'create') p.onCreate?.(t);
    else p.onPick?.(o.it);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!opts.length) return;
      const n = (cur + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      setAct(n);
      document.getElementById(`${uid}-o${n}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(opts[cur]);
    }
  };
  if (overlay && !mounted) return null;
  const row = (o: Opt, i: number) => {
    const props = {
      id: `${uid}-o${i}`,
      active: i === cur,
      onHover: () => {
        if (i !== cur) setAct(i);
      },
      onPick: () => pick(o),
    };
    return (
      <div key={optKey(o)} data-opt={i} className={cx('tp-sp-opt', o.kind === 'similar' && 'tp-sp-opt-sim')}>
        {o.kind === 'query' ? (
          <SearchHit {...props} query={o.q} />
        ) : o.kind === 'create' ? (
          <SearchHit {...props} create={q.trim()} />
        ) : o.kind === 'similar' ? (
          <SearchHit {...props} item={o.it} />
        ) : (
          <SearchHit {...props} item={o.it} tokens={toks} />
        )}
      </div>
    );
  };
  const body: React.ReactNode[] = [];
  let n = 0;
  if (!ql) {
    if (past.length) {
      body.push(
        <div key="ph" className="tp-sp-head tp-sp-head-row">
          <span>{p.historyLabel ?? 'Recent searches'}</span>
          {p.onClearHistory ? (
            <button
              type="button"
              className="tp-sp-headbtn"
              onClick={() => {
                p.onClearHistory?.();
                focusInput();
              }}
            >
              Clear
            </button>
          ) : null}
        </div>,
      );
      for (const _ of past) body.push(row(opts[n]!, n++));
    }
    if (recent.length) {
      body.push(
        <div key="rh" className={cx('tp-sp-head', past.length && 'tp-sp-head-sim')}>
          {p.recentLabel ?? 'Recently opened'}
        </div>,
      );
      for (const _ of recent) body.push(row(opts[n]!, n++));
    }
    if (!past.length && !recent.length)
      body.push(
        <p key="hint" className="tp-sp-hint">
          {p.hint ?? 'Search your tasks by title, task ID, Jira key or note.'}
        </p>,
      );
  } else if (showLoading && !hits.length) {
    body.push(
      <div key="load" className="tp-sp-load" aria-label="Loading your tasks" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tp-sp-skel">
            <Skeleton width={[220, 300, 180][i]} height={12} />
            <Skeleton width={[120, 90, 140][i]} height={9} />
          </div>
        ))}
      </div>,
    );
  } else {
    if (p.error && !hits.length)
      body.push(
        <p key="err" className="tp-sp-quiet" role="status">
          Couldn’t search right now.
          {p.onRetry ? (
            <button type="button" className="tp-sp-headbtn" onClick={p.onRetry}>
              Try again
            </button>
          ) : null}
        </p>,
      );
    if (fresh && !hits.length && !p.error) {
      body.push(
        <p key="none" className="tp-sp-none">
          No task matches “<b>{q.trim()}</b>”.
        </p>,
      );
      body.push(row(opts[n]!, n++));
    }
    for (const _ of hits) body.push(row(opts[n]!, n++));
    if (simOn && (sim.state !== 'done' || simItems.length)) {
      body.push(
        <div key="sh" className="tp-sp-head tp-sp-head-sim">
          {p.similarLabel ?? 'Close matches'}
        </div>,
      );
      if (sim.state === 'loading')
        body.push(
          <p key="sl" className="tp-sp-quiet" role="status" aria-busy="true">
            <svg
              className="tp-spin"
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
            Looking for tasks like this…
          </p>,
        );
      else if (sim.state === 'error')
        body.push(
          <p key="se" className="tp-sp-quiet" role="status">
            Close matches aren’t available right now. Word matches still work.
          </p>,
        );
      else for (const _ of simItems) body.push(row(opts[n]!, n++));
    }
  }

  const clearBtn = (
    <IconButton
      label="Clear"
      tip={false}
      className="tp-sp-clr"
      onClick={() => {
        setQ('');
        focusInput();
      }}
    >
      <Icon name="x" size={14} />
    </IconButton>
  );
  const line = (
    <div className="tp-sp-line">
      <span className="tp-sp-icon" aria-hidden="true">
        <Icon name="search" size={phone ? 18 : 17} />
      </span>
      <input
        ref={input}
        className="tp-sp-input"
        value={q}
        placeholder={p.placeholder ?? 'Search tasks'}
        type="search"
        aria-label="Search tasks"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${uid}-list`}
        aria-activedescendant={opts.length ? `${uid}-o${cur}` : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
      />
      {phone ? <span className={cx('tp-sp-clrpos', !q && 'tp-hide')}>{clearBtn}</span> : null}
      {phone ? (
        <button type="button" className="tp-sp-cancel" onClick={() => p.onClose?.()}>
          Cancel
        </button>
      ) : (
        // One quiet button: it clears what you typed; with nothing typed it closes.
        <span className={cx('tp-sp-x', !q && !p.onClose && 'tp-hide')}>
          <IconButton
            label={q ? 'Clear' : 'Close'}
            tip={false}
            onClick={() => {
              if (q) {
                setQ('');
                focusInput();
              } else p.onClose?.();
            }}
          >
            <Icon name="x" size={15} />
          </IconButton>
        </span>
      )}
    </div>
  );
  const panel = (
    <section
      className={cx('tp-sp', 'tp-sheet', phone ? 'tp-sp-phone' : 'tp-sp-desk', p.className)}
      role={overlay ? 'dialog' : 'search'}
      aria-label="Search tasks"
      style={p.maxHeight ? ({ '--sp-max': `${p.maxHeight}px` } as React.CSSProperties) : undefined}
    >
      {phone ? <div className="tp-qa-grabber" aria-hidden="true" /> : null}
      {line}
      <div ref={wrap} className="tp-sp-wrap">
        <div
          ref={inner}
          className="tp-sp-list"
          id={`${uid}-list`}
          role="listbox"
          aria-label="Matching tasks"
          data-answer={ql ? (fresh ? ql : '') : undefined}
          data-similar={ql ? (simOn ? sim.state : 'off') : undefined}
        >
          {body}
        </div>
      </div>
    </section>
  );
  if (!overlay)
    return <div className={cx('tp-root tp-sp-static', phone && 'tp-sp-static-phone')}>{panel}</div>;
  return (
    <div
      className={cx(
        'tp-root tp-sp-layer',
        phone ? 'tp-sp-layer-sheet' : 'tp-sp-layer-dialog',
        leaving && 'tp-leaving',
      )}
    >
      <div className="tp-qa-veil tp-sp-veil" aria-hidden="true" onClick={() => p.onClose?.()} />
      {panel}
    </div>
  );
}
