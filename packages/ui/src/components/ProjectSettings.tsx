import { PROJECT_COLORS } from '@tudu/core';
import { useState } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { ColorPick } from './ColorPick';
import { SettingRow, SettingsSection } from './SettingsSection';

export interface ProjectSettingsProject {
  id: string;
  name: string;
  color: string;
  /** Open tasks on it. */
  open: number;
}

export interface ProjectSettingsProps {
  projects: ProjectSettingsProject[];
  onRename?: (p: ProjectSettingsProject, name: string) => void;
  onRecolour?: (p: ProjectSettingsProject, color: string) => void;
  onDelete?: (p: ProjectSettingsProject) => void;
  onCreate?: (name: string) => void;
}

/** "3 open tasks", "No open tasks". */
export function openWords(n: number): string {
  return n === 0 ? 'No open tasks' : n === 1 ? '1 open task' : `${n} open tasks`;
}

/** A name that saves when you leave it (or press Enter); Esc and an empty name put the old one back. */
function NameInput({ value, label, onSave }: { value: string; label: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setDraft(value);
  }
  const save = () => {
    const v = draft.trim();
    if (!v) setDraft(value);
    else if (v !== value) onSave(v);
  };
  return (
    <input
      className="tp-sprj-name"
      value={draft}
      aria-label={label}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

/**
 * The space's projects in Settings › Space: each one's dot (it opens the swatches under the row), its name (saves when you leave it),
 * how many open tasks it has, and Delete; New project at the foot. Not drawn in the design: built from its rows.
 */
export function ProjectSettings({
  projects,
  onRename,
  onRecolour,
  onDelete,
  onCreate,
}: ProjectSettingsProps) {
  const [fresh, setFresh] = useState('');
  // The project whose swatches are open under it, if any.
  const [picking, setPicking] = useState<string | null>(null);
  const add = () => {
    const v = fresh.trim();
    if (!v) return;
    onCreate?.(v);
    setFresh('');
  };
  return (
    <SettingsSection
      title="Projects"
      aside={projects.length ? String(projects.length) : undefined}
      sub="The coloured dot on a task. Renaming or recolouring one changes it on every task."
    >
      {projects.map((p) => (
        <SettingRow
          key={p.id}
          className="tp-sprj"
          title={
            <span className="tp-sprj-t">
              <button
                type="button"
                className={cx('tp-sprj-dot', picking === p.id && 'tp-on')}
                style={{ background: p.color }}
                aria-label={`Colour of ${p.name}`}
                aria-expanded={picking === p.id}
                onClick={() => setPicking(picking === p.id ? null : p.id)}
              />
              <NameInput value={p.name} label={`Name of ${p.name}`} onSave={(v) => onRename?.(p, v)} />
            </span>
          }
          sub={openWords(p.open)}
          control={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDelete?.(p)}
              aria-label={`Delete ${p.name}`}
            >
              Delete
            </Button>
          }
        >
          {picking === p.id ? (
            <ColorPick
              className="tp-sprj-pick"
              value={p.color}
              colors={PROJECT_COLORS}
              label={`Colour of ${p.name}`}
              onChange={(c) => {
                onRecolour?.(p, c);
                setPicking(null);
              }}
            />
          ) : null}
        </SettingRow>
      ))}
      {!projects.length ? (
        <p className="tp-set-note">No projects yet. Give tasks a dot from Quick Add.</p>
      ) : null}
      <div className="tp-sprj-new">
        <input
          className="tp-sprj-name"
          value={fresh}
          placeholder="New project"
          aria-label="New project"
          maxLength={60}
          onChange={(e) => setFresh(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
        />
        <Button variant="secondary" size="sm" disabled={!fresh.trim()} onClick={add}>
          Add
        </Button>
      </div>
    </SettingsSection>
  );
}
