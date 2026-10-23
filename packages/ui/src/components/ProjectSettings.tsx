import { PROJECT_COLORS, PROJECT_NAME_MAX, nextProjectColor } from '@tudu/core';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { ColorPick } from './ColorPick';
import { Field } from './Field';
import { Icon } from '../lib/icons';
import { IconButton } from './IconButton';
import { Menu } from './Menu';
import { SettingsSection } from './SettingsSection';

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
  onCreate?: (name: string, color: string) => void;
  /** Open the editor on this project (or 'new') at once: the kit's states. */
  defaultEditing?: string | null;
}

/** "3 open tasks", "No open tasks". */
export function openWords(n: number): string {
  return n === 0 ? 'No open tasks' : n === 1 ? '1 open task' : `${n} open tasks`;
}

/** "5 open", "None open": the row's count. */
export function openShort(n: number): string {
  return n === 0 ? 'None open' : `${n} open`;
}

interface Draft {
  name: string;
  color: string;
}

/** The one editor card, for a new project and for changing one: name, swatches, and how it will read on a task. */
function Editor({
  project,
  draft,
  onDraft,
  onSave,
  onCancel,
  onDelete,
  focus,
}: {
  project: ProjectSettingsProject | null;
  draft: Draft;
  onDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Take the keyboard when it opens (not when a page draws it open, as the kit does). */
  focus: boolean;
}) {
  const name = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) name.current?.focus();
  }, [focus]);
  const trimmed = draft.name.trim();
  const changed = !project || trimmed !== project.name || draft.color !== project.color;
  const ok = !!trimmed && changed;
  return (
    <div
      className="tp-prj-ed"
      role="group"
      aria-label={project ? `Edit ${project.name}` : 'New project'}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && ok) {
          e.preventDefault();
          onSave();
        }
      }}
    >
      <div>
        <span className="tp-prj-l">Name</span>
        <Field
          ref={name}
          label="Project name"
          placeholder="Like Onboarding or Hiring"
          value={draft.name}
          maxLength={PROJECT_NAME_MAX}
          onChange={(e) => onDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <div>
        <span className="tp-prj-l">Colour</span>
        <ColorPick
          value={draft.color}
          colors={PROJECT_COLORS}
          label="Project colour"
          onChange={(color) => onDraft({ ...draft, color })}
        />
      </div>
      <div className="tp-prj-prev" aria-label="On a task">
        <span>On a task</span>
        <span className="tp-tl-by">
          <span>Tomorrow</span>
          <span>
            <i style={{ background: draft.color }} />
            {trimmed || 'Project name'}
          </span>
        </span>
        {project ? <span className="tp-prj-open">{openWords(project.open)}</span> : null}
      </div>
      <div className="tp-prj-f">
        {project && onDelete ? (
          <Button variant="quiet" size="sm" onClick={onDelete}>
            Delete project
          </Button>
        ) : null}
        <span className="tp-prj-sp" />
        <Button variant="quiet" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" disabled={!ok} onClick={onSave}>
          {project ? 'Save' : 'Create project'}
        </Button>
      </div>
    </div>
  );
}

/**
 * The space's projects in Settings › Space, as K-Projects draws them: a quiet list (dot, name, how many are open,
 * ⋯) with New project in the head. A row, New project, or ⋯ › Edit name and colour opens the one editor card; one at
 * a time. Delete asks nothing: the caller's toast says what happened to the tasks and Undo puts it back.
 */
export function ProjectSettings({
  projects,
  onRename,
  onRecolour,
  onDelete,
  onCreate,
  defaultEditing = null,
}: ProjectSettingsProps) {
  // Which project the editor is open on: an id, 'new', or none.
  const [editing, setEditing] = useState<string | null>(defaultEditing);
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => {
    const p = projects.find((x) => x.id === defaultEditing);
    return p
      ? { name: p.name, color: p.color }
      : { name: '', color: nextProjectColor(projects.map((x) => x.color)) };
  });
  const open = (p: ProjectSettingsProject | null) => {
    setOpened(true);
    setEditing(p ? p.id : 'new');
    setDraft(
      p
        ? { name: p.name, color: p.color }
        : { name: '', color: nextProjectColor(projects.map((x) => x.color)) },
    );
  };
  const close = () => setEditing(null);
  // A project deleted elsewhere (or by this editor) closes its editor.
  const editingGone = editing && editing !== 'new' && !projects.some((p) => p.id === editing);
  if (editingGone) setEditing(null);
  const save = (p: ProjectSettingsProject | null) => {
    const name = draft.name.trim();
    if (!name) return;
    if (!p) onCreate?.(name, draft.color);
    else {
      if (name !== p.name) onRename?.(p, name);
      if (draft.color !== p.color) onRecolour?.(p, draft.color);
    }
    close();
  };
  const remove = (p: ProjectSettingsProject) => {
    if (editing === p.id) close();
    onDelete?.(p);
  };
  const editor = (p: ProjectSettingsProject | null) => (
    <Editor
      key={p ? p.id : 'new'}
      project={p}
      draft={draft}
      onDraft={setDraft}
      onSave={() => save(p)}
      onCancel={close}
      onDelete={p && onDelete ? () => remove(p) : undefined}
      focus={opened}
    />
  );
  const newButton = (variant: 'secondary' | 'primary') => (
    <Button
      variant={variant}
      size="sm"
      icon={<Icon name="plus" size={14} />}
      disabled={editing === 'new'}
      onClick={() => open(null)}
    >
      New project
    </Button>
  );

  return (
    <SettingsSection title="Projects" aside={projects.length ? String(projects.length) : undefined}>
      <div id="projects" className="tp-prj">
        {projects.length || editing === 'new' ? (
          <>
            <div className="tp-prj-top">
              <p>A coloured dot on a task, to group and filter by. Changing one changes it on every task.</p>
              {newButton('secondary')}
            </div>
            <div className="tp-prj-list" role="list" aria-label="Projects">
              {editing === 'new' ? editor(null) : null}
              {projects.map((p) =>
                editing === p.id ? (
                  editor(p)
                ) : (
                  <div key={p.id} className="tp-prj-row" role="listitem">
                    <button
                      type="button"
                      className="tp-prj-main"
                      aria-label={`Edit ${p.name}, ${openWords(p.open)}`}
                      onClick={() => open(p)}
                    >
                      <i className="tp-prj-dot" style={{ background: p.color }} aria-hidden="true" />
                      <span className="tp-prj-n">{p.name}</span>
                      <span className="tp-prj-c" aria-hidden="true">
                        {openShort(p.open)}
                      </span>
                    </button>
                    <Menu
                      label={`More for ${p.name}`}
                      items={[
                        { label: 'Edit name and colour', onSelect: () => open(p) },
                        onDelete && { label: 'Delete', danger: true, onSelect: () => remove(p) },
                      ]}
                    >
                      <IconButton label={`More for ${p.name}`} tip={false}>
                        <Icon name="more" size={16} />
                      </IconButton>
                    </Menu>
                  </div>
                ),
              )}
            </div>
          </>
        ) : (
          <div className="tp-prj-empty">
            <div className="tp-prj-dots" aria-hidden="true">
              {PROJECT_COLORS.slice(0, 3).map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </div>
            <h3>No projects yet</h3>
            <p>
              A project puts a coloured dot on tasks, so you can see what belongs together and filter the
              Backlog by it.
            </p>
            {newButton('primary')}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
