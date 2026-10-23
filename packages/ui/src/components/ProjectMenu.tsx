import { PROJECT_NAME_MAX } from '@tudu/core';
import { useState, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { MenuList } from './Menu';

export interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

export interface ProjectMenuProps {
  projects: ProjectOption[];
  selected: string | null;
  /** A project, or null for "No project". */
  onPick: (id: string | null) => void;
  /** "New project…": asks for a name on the spot. Without it the line stays out. */
  onNew?: (name: string) => void;
  /** "Edit projects…", the last line: opens Settings on the space's Projects. Without it the line stays out. */
  onEdit?: () => void;
  heading?: string;
  className?: string;
}

/**
 * The project picker, drawn in place by whatever opened it: each project with its dot, "No project", and
 * "New project…", which turns into a name field right there (Enter makes it, Esc goes back).
 */
export function ProjectMenu({
  projects,
  selected,
  onPick,
  onNew,
  onEdit,
  heading = 'Project',
  className,
}: ProjectMenuProps) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  function make() {
    const t = name.trim();
    if (!t) return;
    onNew?.(t);
    setName('');
    setNaming(false);
  }
  if (naming)
    return (
      <div className={cx('tp-root tp-menu tp-pm-new', className)}>
        <div className="tp-mh">New project</div>
        <div className="tp-pm-field">
          <input
            autoFocus
            value={name}
            maxLength={PROJECT_NAME_MAX}
            placeholder="Name it"
            aria-label="Project name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                make();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                setNaming(false);
                setName('');
              }
            }}
          />
          <Button variant="quiet" size="sm" disabled={!name.trim()} onClick={make}>
            Add
          </Button>
        </div>
      </div>
    );
  return (
    <MenuList
      label={heading}
      heading={heading}
      className={className}
      items={[
        ...projects.map((x) => ({
          label: (
            <span className="tp-td-mi">
              <i className="tp-dot" style={{ background: x.color }} />
              {x.name}
            </span>
          ),
          hint: x.id === selected ? '✓' : undefined,
          onSelect: () => onPick(x.id),
        })),
        selected ? { label: 'No project', onSelect: () => onPick(null) } : null,
        onNew ? { label: 'New project…', onSelect: () => setNaming(true) } : null,
        onEdit ? { label: 'Edit projects…', onSelect: onEdit } : null,
      ]}
    />
  );
}
