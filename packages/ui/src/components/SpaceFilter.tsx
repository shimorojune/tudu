import { useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { useWidthEase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Menu } from './Menu';
import { SpaceTile } from './SpaceTile';

export interface FilterSpace {
  id: string;
  name: string;
  color?: string | null;
  initials: string;
  personal?: boolean;
  /** What waits there for you; shown beside it in the menu. */
  count?: number;
}

export interface SpaceFilterProps {
  spaces: FilterSpace[];
  /** Everything's count, beside "All spaces". */
  total?: number;
  /** The chosen space's id, or null for every space. */
  value: string | null;
  onChange?: (id: string | null) => void;
  /** All spaces' own pages: "All spaces" wears its ink tile instead of the Inbox's icon. */
  allTile?: boolean;
  className?: string;
}

/**
 * The Inbox's one filter: by space. A quiet pill ("All spaces", or the space with its tile) that opens a short menu
 * with every space you are in and what waits there. Picking swaps the list in place; the pill eases to its new width.
 */
export function SpaceFilter({ spaces, total, value, onChange, allTile, className }: SpaceFilterProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const cur = value ? spaces.find((s) => s.id === value) : undefined;
  const label = cur ? cur.name : 'All spaces';
  useWidthEase(btn, label);
  const pick = (id: string | null) => () => onChange?.(id);
  const tile = (s: FilterSpace, size: number) => (
    <SpaceTile
      space={{ name: s.name, color: s.color ?? undefined, initials: s.initials, personal: s.personal }}
      size={size}
    />
  );
  return (
    <div className={cx('tp-root tp-sf', open && 'tp-on', className)}>
      <Menu
        label="Filter by space"
        heading="Space"
        align="start"
        open={open}
        onOpenChange={setOpen}
        items={[
          {
            label: (
              <span className="tp-td-mi">
                {allTile ? (
                  <SpaceTile space={{ all: true, name: 'All spaces' }} size={18} />
                ) : (
                  <Icon name="inbox" size={14} />
                )}
                All spaces
              </span>
            ),
            hint: total != null ? String(total) : undefined,
            onSelect: pick(null),
          },
          ...spaces.map((s) => ({
            label: (
              <span className="tp-td-mi">
                {tile(s, 18)}
                {s.name}
              </span>
            ),
            hint: s.count != null ? String(s.count) : undefined,
            onSelect: pick(s.id),
          })),
        ]}
      >
        <button
          ref={btn}
          type="button"
          className={cx('tp-sf-pill', cur && 'tp-set')}
          aria-label={`Space: ${cur ? cur.name : 'all spaces'}`}
        >
          {cur ? (
            tile(cur, 16)
          ) : allTile ? (
            <SpaceTile space={{ all: true, name: 'All spaces' }} size={16} />
          ) : (
            <Icon name="inbox" size={14} />
          )}
          <span>{label}</span>
          <Icon name="caret" size={12} className="tp-sf-caret" />
        </button>
      </Menu>
    </div>
  );
}
