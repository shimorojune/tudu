import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { FilterField } from './FilterField';
import { PersonDot, type PersonDotPerson } from './PersonDot';

export interface PickPerson extends PersonDotPerson {
  id: string;
  name: string;
  email?: string;
  you?: boolean;
}

export interface PersonPickProps {
  /** The people in the space; you are left out (the `me` row stands for you). */
  people: PickPerson[];
  selected?: PickPerson | null;
  /** null is you. */
  onPick?: (person: PickPerson | null) => void;
  heading?: string;
  /** Adds a "Me" row first, picked when nothing else is. */
  me?: PersonDotPerson;
  /** "On your list in Northwind". */
  meSub?: string;
  className?: string;
}

/** Past this many people a Find someone line sits on top. */
export const PICK_FIND_FROM = 6;

const tick = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.4 9.8 17.2 19.2 6.8" />
  </svg>
);

/**
 * Who a task goes to: a short list of the people in the space with their mark, name and email; the picked one has a
 * tick. Past six people a quiet Find someone sits on top. The heading and the search stay put; the people scroll
 * inside, taking the room left on screen (at most 320px, at least 150px).
 */
export function PersonPick({ people, selected, onPick, heading, me, meSub, className }: PersonPickProps) {
  const others = people.filter((x) => !x.you);
  const [q, setQ] = useState('');
  const list = q
    ? others.filter((x) => `${x.name} ${x.email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    : others;
  const listEl = useRef<HTMLDivElement | null>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = listEl.current;
    if (!el) return;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const r = el.getBoundingClientRect();
    const up = el.closest('.tp-qa-pop-up');
    const pop = up ?? el.parentElement!;
    const pr = pop.getBoundingClientRect();
    const rest = pr.height - r.height;
    const room = up ? pr.bottom - rest - 16 : vh - r.top - 20;
    setMaxH(Math.max(150, Math.min(320, Math.floor(room))));
  }, []);
  const row = (
    key: string,
    on: boolean,
    person: PersonDotPerson,
    name: string,
    sub: string | undefined,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={on ? 'true' : 'false'}
      className={cx('tp-ppick-it', on && 'tp-on')}
      onClick={onClick}
    >
      <PersonDot person={person} size={24} />
      <span className="tp-ppick-n">
        <span>{name}</span>
        {sub ? <span className="tp-ppick-e">{sub}</span> : null}
      </span>
      {on ? (
        <span className="tp-ppick-ok" aria-hidden="true">
          {tick}
        </span>
      ) : null}
    </button>
  );
  return (
    <div className={cx('tp-root tp-ppick', className)} role="menu" aria-label={heading ?? 'Send to'}>
      {heading ? <div className="tp-mh">{heading}</div> : null}
      {others.length > PICK_FIND_FROM ? (
        <div className="tp-ppick-q">
          <FilterField value={q} onChange={setQ} placeholder="Find someone" />
        </div>
      ) : null}
      <div ref={listEl} className="tp-ppick-list" style={maxH ? { maxHeight: maxH } : undefined}>
        {me && !q ? row('_me', !selected, me, 'Me', meSub ?? 'On your own list', () => onPick?.(null)) : null}
        {list.map((x) => row(x.id, selected?.id === x.id, x, x.name, x.email, () => onPick?.(x)))}
        {!list.length && (q || !me) ? <div className="tp-ppick-none">No one by that name.</div> : null}
      </div>
    </div>
  );
}
