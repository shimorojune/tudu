import {
  PROJECT_COLOR_NAMES,
  PROJECT_COLORS,
  PROJECT_NAME_MAX,
  nextProjectColor,
  projectNamed,
} from '@tudu/core';
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useTimer } from '../lib/hooks';
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
  /** The space's name, for "Northwind already has Hiring." */
  spaceName?: string;
  onRename?: (p: ProjectSettingsProject, name: string) => void;
  onRecolour?: (p: ProjectSettingsProject, color: string) => void;
  onDelete?: (p: ProjectSettingsProject) => void;
  /** Make it; return its id so its row can take focus and the wash when it arrives. */
  onCreate?: (name: string, color: string) => string | void;
  /** Open the editor on this project (or 'new') at once: the kit's states. */
  defaultEditing?: string | null;
  /** Draw the editor in place under its anchor instead of floating it (the kit, where several sit on one page). */
  inline?: boolean;
}

/** "3 open tasks", "No open tasks". */
export function openWords(n: number): string {
  return n === 0 ? 'No open tasks' : n === 1 ? '1 open task' : `${n} open tasks`;
}

/** "5 open", "None open": the row's count. */
export function openShort(n: number): string {
  return n === 0 ? 'None open' : `${n} open`;
}

/** How long a new or changed row keeps its wash. */
const FRESH_MS = 2200;

interface Draft {
  name: string;
  color: string;
}

/** The editor's card, for a new project and for changing one: a heading, the name, the swatches and the buttons. */
function Editor({
  project,
  draft,
  taken,
  onDraft,
  onSave,
  onCancel,
  onDelete,
  focus,
}: {
  project: ProjectSettingsProject | null;
  draft: Draft;
  /** The sentence when the name is already used in the space, or null. */
  taken: string | null;
  onDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  /** Take the keyboard when it opens (not when a page draws it open, as the kit does). */
  focus: boolean;
}) {
  const trimmed = draft.name.trim();
  const changed = !project || trimmed !== project.name || draft.color !== project.color;
  const ok = !!trimmed && changed && !taken;
  const near = draft.name.length >= PROJECT_NAME_MAX - 10;
  const field = useRef<HTMLInputElement>(null);
  // The ⋯ menu gives focus back to its button as it closes, just after this opens: take it again on the next frame.
  useEffect(() => {
    if (!focus) return;
    const f = requestAnimationFrame(() => {
      if (document.activeElement !== field.current) field.current?.focus();
    });
    return () => cancelAnimationFrame(f);
  }, [focus]);
  return (
    <div
      className="tp-prj-ed"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          if (ok) onSave();
        }
      }}
    >
      <h3 className="tp-prj-h">{project ? `Edit ${project.name}` : 'New project'}</h3>
      <div>
        <span className="tp-prj-l">
          <span>Name</span>
          {near ? (
            <span className="tp-prj-count" aria-hidden="true">
              {draft.name.length}/{PROJECT_NAME_MAX}
            </span>
          ) : null}
        </span>
        <Field
          ref={field}
          label="Project name"
          placeholder="Like Onboarding or Hiring"
          value={draft.name}
          maxLength={PROJECT_NAME_MAX}
          error={taken ?? undefined}
          autoFocus={focus}
          onChange={(e) => onDraft({ ...draft, name: e.target.value })}
        />
      </div>
      <div>
        <span className="tp-prj-l">
          <span>Colour</span>
        </span>
        <ColorPick
          value={draft.color}
          colors={PROJECT_COLORS}
          names={PROJECT_COLOR_NAMES}
          label="Project colour"
          onChange={(color) => onDraft({ ...draft, color })}
        />
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
 * The space's projects in Settings › Space, as K-Projects and K-Projects-Flow draw them: a quiet list (dot, name, how
 * many are open, ⋯) with New project in the head, newest first. New project, a row, or ⋯ › Edit name and colour opens
 * one small popup under what opened it; it closes on Save, Cancel, Esc or a click outside, and nothing in the list
 * moves. Delete asks nothing: the caller's toast says what happened to the tasks and Undo puts it back.
 */
export function ProjectSettings({
  projects,
  spaceName = 'This space',
  onRename,
  onRecolour,
  onDelete,
  onCreate,
  defaultEditing = null,
  inline = false,
}: ProjectSettingsProps) {
  // Which project the popup is open on: an id, 'new', or none.
  const [editing, setEditing] = useState<string | null>(defaultEditing);
  const [draft, setDraft] = useState<Draft>(() => {
    const p = projects.find((x) => x.id === defaultEditing);
    return p
      ? { name: p.name, color: p.color }
      : { name: '', color: nextProjectColor(projects.map((x) => x.color)) };
  });
  // The row that just arrived or changed keeps the wash for a moment.
  const [fresh, setFresh] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  // Where focus goes once the popup has closed: a row (by id, once it is drawn) or New project.
  const focusAfter = useRef<string | null>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const later = useTimer();

  const open = (p: ProjectSettingsProject | null) => {
    setOpened(true);
    setEditing(p ? p.id : 'new');
    setDraft(
      p
        ? { name: p.name, color: p.color }
        : { name: '', color: nextProjectColor(projects.map((x) => x.color)) },
    );
  };
  // Closing without saving: focus goes back to what opened the popup.
  const close = () => {
    if (editing) focusAfter.current = editing;
    setEditing(null);
  };
  // A project deleted elsewhere (or by this editor) closes its popup.
  const editingGone = editing && editing !== 'new' && !projects.some((p) => p.id === editing);
  if (editingGone) setEditing(null);

  const project = editing && editing !== 'new' ? (projects.find((p) => p.id === editing) ?? null) : null;
  const same = editing ? projectNamed(projects, draft.name, project?.id) : null;
  const taken = same ? `${spaceName} already has ${same.name}.` : null;

  const markFresh = (id: string) => {
    focusAfter.current = id;
    setFresh(id);
    later(() => setFresh(null), FRESH_MS);
  };
  const save = () => {
    const name = draft.name.trim();
    if (!name || taken) return;
    if (!project) {
      const id = onCreate?.(name, draft.color);
      if (id) markFresh(id);
      else focusAfter.current = 'new';
    } else {
      if (name !== project.name) onRename?.(project, name);
      if (draft.color !== project.color) onRecolour?.(project, draft.color);
      markFresh(project.id);
    }
    setEditing(null);
  };
  const remove = (p: ProjectSettingsProject) => {
    if (editing === p.id) setEditing(null);
    onDelete?.(p);
  };

  // Focus lands on the row once it is drawn (a new one arrives a render after Create), or on New project.
  useEffect(() => {
    const to = focusAfter.current;
    if (editing || to === null) return;
    const el =
      to === 'new' ? newButton.current : rows.current.get(to)?.querySelector<HTMLElement>('.tp-prj-main');
    if (el) {
      focusAfter.current = null;
      el.focus();
    }
  });

  const editor = editing ? (
    <Editor
      key={editing}
      project={project}
      draft={draft}
      taken={taken}
      onDraft={setDraft}
      onSave={save}
      onCancel={close}
      onDelete={project && onDelete ? () => remove(project) : undefined}
      focus={opened || !inline}
    />
  ) : null;

  const pop = (where: 'new' | 'row' | 'empty'): ReactNode => {
    const label = project ? `Edit ${project.name}` : 'New project';
    if (inline)
      return (
        <div
          className={cx('tp-prj-pop tp-prj-pop-inline', `tp-prj-pop-${where}`)}
          role="dialog"
          aria-label={label}
        >
          {editor}
        </div>
      );
    return (
      <Popover.Portal>
        <Popover.Content
          className={cx('tp-root tp-prj-pop', `tp-prj-pop-${where}`)}
          aria-label={label}
          side="bottom"
          align={where === 'new' ? 'end' : where === 'empty' ? 'center' : 'start'}
          alignOffset={where === 'row' ? 28 : 0}
          sideOffset={where === 'row' ? 2 : 6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Another row, or New project: let its click move the popup there instead of closing and reopening.
            const target = e.detail.originalEvent.target as Element | null;
            if (target?.closest?.('.tp-prj-main')) e.preventDefault();
          }}
          // Focus is placed by the effect above, once the row it belongs on is drawn.
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {editor}
        </Popover.Content>
      </Popover.Portal>
    );
  };

  const newProjectButton = (variant: 'secondary' | 'primary') => (
    <Button
      ref={newButton}
      variant={variant}
      size="sm"
      icon={<Icon name="plus" size={14} />}
      disabled={editing === 'new'}
      onClick={() => open(null)}
    >
      New project
    </Button>
  );
  // Where the popup hangs from: New project's head, the empty state's button, or the row being edited.
  const where: 'new' | 'row' | 'empty' | null = !editing
    ? null
    : editing !== 'new'
      ? 'row'
      : projects.length
        ? 'new'
        : 'empty';

  const body = (
    <div id="projects" className="tp-prj">
      {projects.length ? (
        <>
          <div className="tp-prj-top">
            <p>A coloured dot on a task, to group and filter by. Changing one changes it on every task.</p>
            <div className="tp-prj-anchor">
              {where === 'new' && !inline ? (
                <Popover.Anchor asChild>{newProjectButton('secondary')}</Popover.Anchor>
              ) : (
                newProjectButton('secondary')
              )}
            </div>
          </div>
          {where === 'new' && inline ? pop('new') : null}
          <div className="tp-prj-list" role="list" aria-label="Projects">
            {projects.map((p) => {
              const row = (
                <div
                  key={p.id}
                  ref={(el) => {
                    if (el) rows.current.set(p.id, el);
                    else rows.current.delete(p.id);
                  }}
                  className={cx('tp-prj-row', editing === p.id && 'tp-on', fresh === p.id && 'tp-prj-fresh')}
                  role="listitem"
                >
                  <button
                    type="button"
                    className="tp-prj-main"
                    aria-label={`Edit ${p.name}, ${openWords(p.open)}`}
                    aria-expanded={editing === p.id}
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
              );
              if (editing !== p.id) return row;
              return inline ? (
                <div key={p.id} className="tp-prj-anchor">
                  {row}
                  {pop('row')}
                </div>
              ) : (
                <Popover.Anchor key={p.id} asChild>
                  {row}
                </Popover.Anchor>
              );
            })}
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
          <div className="tp-prj-anchor">
            {where === 'empty' && !inline ? (
              <Popover.Anchor asChild>{newProjectButton('primary')}</Popover.Anchor>
            ) : (
              newProjectButton('primary')
            )}
            {where === 'empty' && inline ? pop('empty') : null}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SettingsSection title="Projects" aside={projects.length ? String(projects.length) : undefined}>
      {inline ? (
        body
      ) : (
        <Popover.Root
          open={!!editing}
          onOpenChange={(next) => {
            if (!next) close();
          }}
        >
          {body}
          {where ? pop(where) : null}
        </Popover.Root>
      )}
    </SettingsSection>
  );
}
