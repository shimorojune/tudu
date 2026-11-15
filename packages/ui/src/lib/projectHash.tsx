import {
  dropHash,
  exactProject,
  hashAt,
  hashMark,
  hashMatches,
  hashProjectName,
  nextProjectColor,
  PROJECT_NAME_MAX,
  type HashToken,
} from '@tudu/core';
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { cx } from './cx';
import { Icon } from './icons';
import { Linger } from './linger';
import { useMine } from './scramble';

/** A project as the # menu shows it. */
export interface HashProject {
  id: string;
  name: string;
  color: string;
}

export interface ProjectHashOptions {
  /** The projects of the space the task goes to; leave it out and # is just text. */
  projects?: readonly HashProject[];
  /** "Projects in Northwind". */
  spaceName?: string;
  /** The space's projects have not come in yet: three quiet rows, Enter waits. */
  loading?: boolean;
  /** The field holding the title. */
  input: RefObject<HTMLInputElement | null>;
  /** Puts new words in the field (the title without its #word). */
  setText: (text: string) => void;
  /** A project was picked. */
  onPick: (project: HashProject) => void;
  /** "New project Garden": makes it and returns its id. Without it no such line is offered. */
  onNew?: (name: string, color: string) => string | void;
  /** Opens above the field (phones). Otherwise it opens above only when there is no room below. */
  up?: boolean;
  /** Saving or confirming: no menu. */
  off?: boolean;
}

export interface ProjectHash {
  /** The menu, to place right after the field inside a positioned box. */
  menu: ReactNode;
  open: boolean;
  /** Spread on the field. */
  field: {
    'aria-expanded'?: boolean;
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
    'aria-autocomplete'?: 'list';
    onSelect: (e: SyntheticEvent<HTMLInputElement>) => void;
  };
  /** Call from the field's onChange, after setting its value. */
  look: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Call first in the field's onKeyDown; true when the menu took the key. */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => boolean;
}

let measure: CanvasRenderingContext2D | null | undefined;
/** How wide some words are in the field's own font: where the # sits, so the menu opens under it. */
function textWidth(el: HTMLInputElement, s: string): number {
  if (measure === undefined) {
    try {
      measure = document.createElement('canvas').getContext('2d');
    } catch {
      measure = null;
    }
  }
  if (!measure) return 0;
  const cs = getComputedStyle(el);
  measure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return measure.measureText(s).width;
}

/** The nearest box that scrolls (or clips) around an element. */
function scroller(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * # in a task's title picks its project. A `#` at the start of the title or after a space opens a small menu under
 * the `#`: the space's projects, narrowed by the letters after it (matched letters bold). Up and Down move, Enter or
 * Tab picks, a space right after a whole name picks it, a click picks; Esc closes and keeps the `#` as words, and that
 * `#` stays closed while you type on. The `#word` leaves the title. No match offers "New project Garden". The menu
 * never makes the list scroll: with no room under the field it opens above it.
 */
export function useProjectHash(o: ProjectHashOptions): ProjectHash {
  const mine = useMine();
  const id = useId();
  const [tok, setTok] = useState<HashToken | null>(null);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [flip, setFlip] = useState(false);
  const kept = useRef(-1);
  const caret = useRef<{ text: string; at: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const projects = o.projects ?? [];
  const on = !!o.projects && !o.off;

  function look(el: HTMLInputElement) {
    const t = on ? hashAt(el.value, el.selectionStart ?? el.value.length) : null;
    if (!t) kept.current = -1;
    if (!t || t.start === kept.current) {
      if (tok) setTok(null);
      return;
    }
    if (!tok || tok.start !== t.start || tok.query !== t.query) {
      setActive(0);
      setErr(null);
    }
    if (!tok || tok.start !== t.start || tok.query !== t.query || tok.end !== t.end) setTok(t);
    setLeft(Math.max(0, el.offsetLeft + textWidth(el, el.value.slice(0, t.start)) - el.scrollLeft - 10));
  }

  const list = tok ? hashMatches(projects, tok.query) : [];
  const newName = tok ? hashProjectName(tok.query) : '';
  const canNew = !!(tok && newName && !list.length && o.onNew);
  const rows = o.loading ? 0 : list.length + (canNew ? 1 : 0);
  const lit = Math.min(active, Math.max(0, rows - 1));

  // Opens above when the box that scrolls has no room below and more above, so opening it never scrolls the list.
  const start = tok ? tok.start : -1;
  const waiting = !!o.loading;
  const failed = !!err;
  useLayoutEffect(() => {
    if (start < 0) return;
    const el = o.input.current;
    const m = box.current;
    if (!el || !m || o.up) return;
    const sc = scroller(el);
    const r = el.getBoundingClientRect();
    const b = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const below = b.bottom - r.bottom;
    const above = r.top - b.top;
    setFlip(below < m.offsetHeight + 8 && above > below);
  }, [start, rows, waiting, failed, o.up, o.input]);

  function pick(p: HashProject) {
    const el = o.input.current;
    if (!tok || !el) return;
    const d = dropHash(el.value, tok);
    o.setText(d.text);
    setTok(null);
    setErr(null);
    o.onPick(p);
    caret.current = { text: d.text, at: d.caret };
  }
  // After a pick the caret goes where the #word was, as soon as the field shows the new words (before any more keys).
  useLayoutEffect(() => {
    const c = caret.current;
    const el = o.input.current;
    if (!c || !el || el.value !== c.text) return;
    caret.current = null;
    try {
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      el.setSelectionRange(c.at, c.at);
    } catch {
      /* the field went away */
    }
  });
  function make() {
    if (!o.onNew || !newName) return;
    if (newName.length > PROJECT_NAME_MAX) {
      setErr(`Project names can be up to ${PROJECT_NAME_MAX} characters.`);
      return;
    }
    const color = nextProjectColor(projects.map((p) => p.color));
    try {
      const made = o.onNew(newName, color);
      if (!made) throw new Error('not made');
      pick({ id: made, name: newName, color });
    } catch {
      setErr(`Couldn’t make ${newName}. Try again.`);
    }
  }
  function choose(i: number) {
    if (i < list.length) pick(list[i]!);
    else if (canNew) make();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): boolean {
    if (!tok || e.nativeEvent.isComposing) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows) setActive((a) => (Math.min(a, rows - 1) + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows);
      return true;
    }
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && rows > 0)) {
      e.preventDefault();
      e.stopPropagation();
      if (rows) choose(lit);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      kept.current = tok.start;
      setTok(null);
      return true;
    }
    if (e.key === ' ' && tok.query) {
      const whole = exactProject(projects, tok.query);
      if (whole) {
        e.preventDefault();
        pick(whole);
        return true;
      }
    }
    return false;
  }

  const optId = (i: number) => `${id}-o${i}`;
  let body: ReactNode = null;
  if (tok) {
    const head = (
      <div className="tp-mh" key="h">
        {o.spaceName ? `Projects in ${mine(o.spaceName)}` : 'Projects'}
      </div>
    );
    if (o.loading)
      body = [
        head,
        <div key="l" className="tp-hm-ld" aria-busy="true" aria-label="Loading projects">
          {[96, 124, 78].map((w) => (
            <div key={w} className="tp-hm-skl">
              <i className="tp-skel tp-hm-skd" />
              <i className="tp-skel" style={{ width: w }} />
            </div>
          ))}
        </div>,
      ];
    else if (!projects.length && !tok.query)
      body = [
        head,
        <p key="n" className="tp-hm-none">
          {`No projects in ${o.spaceName ? mine(o.spaceName) : 'this space'} yet. Write a name after the # to make one.`}
        </p>,
      ];
    else
      body = [
        head,
        ...list.map((p, i) => {
          const mark = hashMark(p.name, tok.query);
          const name = mine(p.name);
          return (
            <div
              key={p.id}
              id={optId(i)}
              role="option"
              aria-selected={i === lit}
              className={cx('tp-mi tp-hm-it', i === lit && 'tp-on')}
              onPointerEnter={() => setActive(i)}
              onClick={() => pick(p)}
            >
              <i className="tp-dot" style={{ background: p.color }} />
              <span className="tp-hm-n">
                {mark && name === p.name ? (
                  <>
                    {name.slice(0, mark[0])}
                    <b>{name.slice(mark[0], mark[1])}</b>
                    {name.slice(mark[1])}
                  </>
                ) : (
                  name
                )}
              </span>
            </div>
          );
        }),
        !list.length ? (
          <p key="z" className="tp-hm-none">
            No project called {tok.query}
          </p>
        ) : null,
        canNew ? (
          <div
            key="new"
            id={optId(list.length)}
            role="option"
            aria-selected={lit === list.length}
            className={cx('tp-mi tp-hm-it tp-hm-new', lit === list.length && 'tp-on')}
            onPointerEnter={() => setActive(list.length)}
            onClick={make}
          >
            <Icon name="plus" size={14} />
            <span className="tp-hm-n">
              New project <b>{newName}</b>
            </span>
          </div>
        ) : null,
        err ? (
          <p key="e" className="tp-hm-err" role="alert">
            {err}
          </p>
        ) : null,
      ];
  }
  const menuId = `${id}-menu`;
  const menu = (
    <Linger open={!!tok} className={cx('tp-hm-pop', (o.up || flip) && 'tp-up')}>
      <div
        ref={box}
        id={menuId}
        className="tp-root tp-menu tp-hm"
        role="listbox"
        aria-label="Projects"
        style={{ marginLeft: left }}
        // A press on the menu keeps the cursor in the title.
        onMouseDown={(e) => e.preventDefault()}
      >
        {body}
      </div>
    </Linger>
  );
  return {
    menu,
    open: !!tok,
    field: {
      ...(on ? { 'aria-autocomplete': 'list' as const } : {}),
      ...(tok ? { 'aria-expanded': true, 'aria-controls': menuId } : {}),
      ...(tok && rows ? { 'aria-activedescendant': optId(lit) } : {}),
      onSelect: (e) => look(e.currentTarget),
    },
    look: (e) => look(e.currentTarget),
    onKeyDown,
  };
}
