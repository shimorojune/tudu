import {
  PROJECT_COLOR_NAMES,
  PROJECT_COLORS,
  PROJECT_NAME_MAX,
  nextProjectColor,
  projectNamed,
} from '@tudu/core';
import { useState, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { ColorPick } from './ColorPick';
import { MenuList } from './Menu';

export interface ProjectOption {
  id: string;
  name: string;
  color: string;
}

export interface ProjectMenuProps {
  projects: ProjectOption[];
  selected: string | null;
  /** A project, or null for "No project". Also how a typed name that already exists is picked. */
  onPick: (id: string | null) => void;
  /** "New project…": a name and a colour on the spot. Without it the line stays out. */
  onNew?: (name: string, color: string) => void;
  /** "Edit projects…", the last line: opens Settings on the space's Projects. Without it the line stays out. */
  onEdit?: () => void;
  heading?: string;
  className?: string;
}

/**
 * The project picker, drawn in place by whatever opened it: each project with its dot, "No project", and
 * "New project…", which turns the same panel into a small name card (a short fade): ‹ back, the name with the dot it
 * will get, the swatches, Add. A name that already exists offers that project instead (Use Hiring).
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
  const [color, setColor] = useState<string>(PROJECT_COLORS[0]);
  // Back from the name card: the list fades in like the card did.
  const [returned, setReturned] = useState(false);
  const same = naming ? projectNamed(projects, name) : null;
  function back() {
    setNaming(false);
    setReturned(true);
    setName('');
  }
  function make() {
    const t = name.trim();
    if (!t) return;
    if (same) onPick(same.id);
    else onNew?.(t, color);
    back();
  }
  if (naming)
    return (
      <div className={cx('tp-root tp-menu tp-pm-new', className)} role="group" aria-label="New project">
        <div className="tp-mh tp-pm-h">
          <button type="button" className="tp-pm-back" aria-label="Back to projects" onClick={back}>
            <Icon name="left" size={14} />
          </button>
          New project
        </div>
        <label className="tp-pm-field">
          <i style={{ background: color }} aria-hidden="true" />
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
                back();
              }
            }}
          />
        </label>
        <ColorPick
          className="tp-pm-sw"
          value={color}
          colors={PROJECT_COLORS}
          names={PROJECT_COLOR_NAMES}
          label="Project colour"
          onChange={setColor}
        />
        <div className="tp-pm-foot">
          <span className="tp-pm-hint" key={same ? 'same' : 'new'}>
            {same ? `${same.name} is already here.` : 'Its colour, here or later in Settings.'}
          </span>
          <Button variant={same ? 'secondary' : 'primary'} size="sm" disabled={!name.trim()} onClick={make}>
            {same ? `Use ${same.name}` : 'Add'}
          </Button>
        </div>
      </div>
    );
  return (
    <MenuList
      label={heading}
      heading={heading}
      className={cx(className, returned && 'tp-pm-fade')}
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
        onNew
          ? {
              label: 'New project…',
              onSelect: () => {
                setColor(nextProjectColor(projects.map((x) => x.color)));
                setNaming(true);
              },
            }
          : null,
        onEdit ? { label: 'Edit projects…', onSelect: onEdit } : null,
      ]}
    />
  );
}
