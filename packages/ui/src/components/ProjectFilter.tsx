import { useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { useWidthEase } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Menu } from './Menu';

export interface FilterProject {
  id: string;
  name: string;
  color: string;
  /** How many tasks of the list it has; shown beside it in the menu. */
  count?: number;
}

export interface ProjectFilterProps {
  projects: FilterProject[];
  /** The whole list's count, beside "All projects". */
  total?: number;
  /** The chosen project's id, or null for all. */
  value: string | null;
  onChange?: (id: string | null) => void;
  allLabel?: string;
  /** "Edit projects…", the menu's last line: Settings on the space's Projects. */
  onEdit?: () => void;
  className?: string;
}

/**
 * The one filter a list offers: by project. A quiet chip ("All projects", or the project with its dot) that opens
 * a short menu with each project and its count. Picking swaps the list in place; the chip eases to its new width.
 */
export function ProjectFilter({
  projects,
  total,
  value,
  onChange,
  allLabel = 'All projects',
  onEdit,
  className,
}: ProjectFilterProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const cur = value ? projects.find((p) => p.id === value) : undefined;
  const label = cur ? cur.name : allLabel;
  useWidthEase(btn, label);
  const pick = (id: string | null) => () => onChange?.(id);
  return (
    <div className={cx('tp-root tp-pf', open && 'tp-on', className)}>
      <Menu
        label="Filter by project"
        heading="Project"
        align="start"
        open={open}
        onOpenChange={setOpen}
        items={[
          {
            label: <span className="tp-td-mi">{allLabel}</span>,
            hint: total != null ? String(total) : undefined,
            onSelect: pick(null),
          },
          ...projects.map((p) => ({
            label: (
              <span className="tp-td-mi">
                <i className="tp-dot" style={{ background: p.color }} aria-hidden="true" />
                {p.name}
              </span>
            ),
            hint: p.count != null ? String(p.count) : undefined,
            onSelect: pick(p.id),
          })),
          onEdit && { label: <span className="tp-td-mi">Edit projects…</span>, onSelect: onEdit },
        ]}
      >
        <button
          ref={btn}
          type="button"
          className="tp-qa-chip"
          aria-label={`Project: ${cur ? cur.name : 'all projects'}`}
        >
          {cur ? (
            <i className="tp-dot" style={{ background: cur.color }} aria-hidden="true" />
          ) : (
            <Icon name="backlog" size={14} />
          )}
          <span>{label}</span>
        </button>
      </Menu>
    </div>
  );
}
