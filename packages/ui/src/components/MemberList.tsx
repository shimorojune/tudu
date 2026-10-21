import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { PersonDot, type PersonDotPerson } from './PersonDot';

export interface MemberListPerson extends PersonDotPerson {
  id: string;
  name: string;
  email: string;
  you?: boolean;
  /** No longer in the space: what they shared stays, under their name marked Left. */
  left?: boolean;
  /** Their shared tasks this week, in quiet mono. */
  count?: number;
}

export interface MemberListProps {
  people: MemberListPerson[];
  /** The picked person's id; nothing for Everyone. */
  active?: string | null;
  onPick?: (person: MemberListPerson | null) => void;
  /** "Everyone": the space's shared list, first. Left out while a search narrows the list. */
  allLabel?: string;
  /** "23 shared this week". */
  allSub?: string;
  allCount?: number;
  /** "Members" over the people. */
  heading?: string;
  /** Shown when a search finds no one: "No one called “Zed” in Northwind." */
  empty?: string;
  className?: string;
}

/**
 * The people of a space as a list that scales (fifty fit before it scrolls): Everyone first, then each person with
 * their mark, name, email and count. You are in it too, marked You. The picked row takes the accent wash; picking
 * never moves the list, only the pane beside it turns.
 */
export function MemberList({
  people,
  active,
  onPick,
  allLabel,
  allSub,
  allCount,
  heading = 'Members',
  empty,
  className,
}: MemberListProps) {
  const row = (
    key: string,
    on: boolean,
    icon: ReactNode,
    name: ReactNode,
    sub: string | undefined,
    count: number | undefined,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={key}
      type="button"
      role="listitem"
      className={cx('tp-ml-it', on && 'tp-on')}
      aria-current={on ? 'true' : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span className="tp-ml-n">
        <span className="tp-ml-name">{name}</span>
        {sub ? <span className="tp-ml-sub">{sub}</span> : null}
      </span>
      {count ? <span className="tp-ml-c">{count}</span> : null}
    </button>
  );
  return (
    <div className={cx('tp-root tp-ml', className)} role="list" aria-label="People">
      {allLabel
        ? row(
            '_all',
            !active,
            <span className="tp-ml-all">
              <Icon name="team" size={16} />
            </span>,
            allLabel,
            allSub,
            allCount,
            allLabel,
            () => {
              if (active) onPick?.(null);
            },
          )
        : null}
      {allLabel && people.length ? <div className="tp-ml-h">{heading}</div> : null}
      {people.map((x) =>
        row(
          x.id,
          active === x.id,
          <PersonDot person={x} size={30} />,
          x.you || x.left ? (
            <>
              {x.name}
              <span className="tp-prow-you">{x.you ? 'You' : 'Left'}</span>
            </>
          ) : (
            x.name
          ),
          x.email,
          x.count,
          x.you ? `${x.name}, you` : x.left ? `${x.name}, left` : x.name,
          () => {
            if (active !== x.id) onPick?.(x);
          },
        ),
      )}
      {!people.length && empty ? <div className="tp-ml-none">{empty}</div> : null}
    </div>
  );
}
