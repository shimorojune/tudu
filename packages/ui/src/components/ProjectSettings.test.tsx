import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROJECT_COLORS } from '@tudu/core';
import { describe, expect, it, vi } from 'vitest';
import { ProjectFilter } from './ProjectFilter';
import { ProjectMenu } from './ProjectMenu';
import { ProjectSettings, type ProjectSettingsProject } from './ProjectSettings';

const PROJECTS: ProjectSettingsProject[] = [
  { id: 'p1', name: 'Onboarding', color: PROJECT_COLORS[0]!, open: 5 },
  { id: 'p2', name: 'Offsite', color: PROJECT_COLORS[1]!, open: 0 },
];

function mount(over: Partial<Parameters<typeof ProjectSettings>[0]> = {}) {
  const fns = { onRename: vi.fn(), onRecolour: vi.fn(), onDelete: vi.fn(), onCreate: vi.fn() };
  const r = render(<ProjectSettings projects={PROJECTS} spaceName="Northwind" {...fns} {...over} />);
  return { ...fns, ...r };
}
/** The editor: a popup (dialog) over the list, never inside it. */
const editor = () => screen.getByRole('dialog', { name: /^(New project|Edit .+)$/ });
const noEditor = () => expect(screen.queryByRole('dialog')).toBeNull();
const nameField = () => screen.getByRole('textbox', { name: 'Project name' });

describe('Settings › Space › Projects (chunk 18)', () => {
  it('C18-U01 the head with New project; rows with dot, name and "5 open" or "None open"; ⋯ with its two items; the empty state', async () => {
    const user = userEvent.setup();
    mount();
    expect(
      screen.getByText(
        'A coloured dot on a task, to group and filter by. Changing one changes it on every task.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Onboarding5 open', 'OffsiteNone open']);
    await user.click(screen.getByRole('button', { name: 'More for Onboarding' }));
    const menu = screen.getByRole('menu', { name: 'More for Onboarding' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Edit name and colour', 'Delete']);
  });

  it('C18-U01 with no projects: "No projects yet", what a project is for, and New project', async () => {
    const user = userEvent.setup();
    const fns = mount({ projects: [] });
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(editor()).toHaveAccessibleName('New project');
    await user.type(nameField(), 'Hiring{Enter}');
    expect(fns.onCreate).toHaveBeenCalledWith('Hiring', PROJECT_COLORS[0]);
  });

  it('C18-U02 New project opens a popup (not in the list) with the name focused and the next unused colour; Create reports both; Esc closes it and New project has focus', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    const list = screen.getByRole('list', { name: 'Projects' });
    expect(list.contains(editor())).toBe(false);
    expect(within(editor()).getByRole('heading', { name: 'New project' })).toBeInTheDocument();
    expect(nameField()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
    const create = screen.getByRole('button', { name: 'Create project' });
    expect(create).toBeDisabled();
    const picked = within(screen.getByRole('radiogroup', { name: 'Project colour' })).getByRole('radio', {
      checked: true,
    });
    expect(picked).toHaveAccessibleName('Ochre');
    await user.type(nameField(), '  Hiring ');
    await user.click(create);
    expect(fns.onCreate).toHaveBeenCalledWith('Hiring', PROJECT_COLORS[2]);
    noEditor();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.keyboard('{Escape}');
    noEditor();
    expect(fns.onCreate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'New project' })).toHaveFocus());
  });

  it('C18-U03 a row opens its popup with its name and colour, the row lit; Save reports only what changed; an empty or unchanged name keeps Save off', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'Edit Onboarding, 5 open tasks' }));
    expect(editor()).toHaveAccessibleName('Edit Onboarding');
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('tp-on');
    const name = nameField();
    expect(name).toHaveValue('Onboarding');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(name);
    expect(save).toBeDisabled();
    await user.type(name, 'Onboarding');
    expect(save).toBeDisabled();
    const swatches = within(screen.getByRole('radiogroup', { name: 'Project colour' })).getAllByRole('radio');
    await user.click(swatches[3]!);
    await user.click(save);
    expect(fns.onRename).not.toHaveBeenCalled();
    expect(fns.onRecolour).toHaveBeenCalledWith(PROJECTS[0], PROJECT_COLORS[3]);
    await user.click(screen.getByRole('button', { name: 'Edit Offsite, No open tasks' }));
    await user.clear(nameField());
    await user.type(nameField(), 'Offsite 2027{Enter}');
    expect(fns.onRename).toHaveBeenCalledWith(PROJECTS[1], 'Offsite 2027');
    expect(fns.onRecolour).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Offsite, No open tasks' })).toHaveFocus(),
    );
  });

  it('C18-U04 one popup at a time; Delete project and ⋯ › Delete report it; no "On a task" preview', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.click(screen.getByRole('button', { name: 'Edit Onboarding, 5 open tasks' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(editor()).toHaveAccessibleName('Edit Onboarding');
    expect(screen.queryByLabelText('On a task')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(fns.onDelete).toHaveBeenCalledWith(PROJECTS[0]);
    noEditor();
    await user.click(screen.getByRole('button', { name: 'More for Offsite' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(fns.onDelete).toHaveBeenLastCalledWith(PROJECTS[1]);
  });

  it('C18-U09 a name the space already has (any case, extra spaces): "Northwind already has Onboarding.", Create off, Enter does nothing', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(nameField(), '  onboarding ');
    expect(screen.getByRole('alert')).toHaveTextContent('Northwind already has Onboarding.');
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
    await user.keyboard('{Enter}');
    expect(fns.onCreate).not.toHaveBeenCalled();
    await user.type(nameField(), ' week');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it("C18-U10 renaming to another project's name is caught; renaming to its own name in another case is allowed", async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'Edit Onboarding, 5 open tasks' }));
    await user.clear(nameField());
    await user.type(nameField(), 'OFFSITE');
    expect(screen.getByRole('alert')).toHaveTextContent('Northwind already has Offsite.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(nameField());
    await user.type(nameField(), 'onboarding{Enter}');
    expect(fns.onRename).toHaveBeenCalledWith(PROJECTS[0], 'onboarding');
  });

  it('C18-U11 a click outside closes the popup like Cancel: nothing is made or changed, and focus goes back', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(nameField(), 'Garden');
    await user.click(screen.getByText(/A coloured dot on a task/));
    noEditor();
    expect(fns.onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Edit Offsite, No open tasks' }));
    await user.type(nameField(), ' trip');
    await user.click(screen.getByText(/A coloured dot on a task/));
    noEditor();
    expect(fns.onRename).not.toHaveBeenCalled();
    expect(fns.onRecolour).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Offsite, No open tasks' })).toHaveFocus(),
    );
  });

  it('C18-U12 the count shows beside Name for the last ten characters; the field takes no more than 60', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    const count = () => editor().querySelector('.tp-prj-count')?.textContent ?? null;
    await user.type(nameField(), 'x'.repeat(49));
    expect(count()).toBeNull();
    await user.type(nameField(), 'x');
    expect(count()).toBe('50/60');
    await user.type(nameField(), 'x'.repeat(15));
    expect(count()).toBe('60/60');
    expect(nameField()).toHaveValue('x'.repeat(60));
  });

  it('C18-U13 after Create the new row, once it arrives, takes focus and the wash; after Save the row does too', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(() => 'p9');
    const { rerender, ...fns } = mount({ onCreate });
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.type(nameField(), 'Garden{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Garden', PROJECT_COLORS[2]);
    const withNew = [{ id: 'p9', name: 'Garden', color: PROJECT_COLORS[2]!, open: 0 }, ...PROJECTS];
    rerender(<ProjectSettings projects={withNew} spaceName="Northwind" {...fns} onCreate={onCreate} />);
    const first = within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Garden');
    expect(first).toHaveClass('tp-prj-fresh');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Edit Garden, No open tasks' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Edit Offsite, No open tasks' }));
    await user.type(nameField(), ' trip{Enter}');
    expect(screen.getAllByRole('listitem')[2]).toHaveClass('tp-prj-fresh');
  });

  it('C18-U05 Edit projects… ends the picker and the Backlog filter when asked for, and calls back; absent without it', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { rerender } = render(
      <ProjectMenu projects={PROJECTS} selected={null} onPick={vi.fn()} onNew={vi.fn()} onEdit={onEdit} />,
    );
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items.at(-1)).toBe('Edit projects…');
    expect(items.at(-2)).toBe('New project…');
    await user.click(screen.getByRole('menuitem', { name: 'Edit projects…' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    rerender(<ProjectMenu projects={PROJECTS} selected={null} onPick={vi.fn()} />);
    expect(screen.queryByRole('menuitem', { name: 'Edit projects…' })).toBeNull();
    rerender(<ProjectFilter projects={PROJECTS} value={null} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Project: all projects' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit projects…' }));
    expect(onEdit).toHaveBeenCalledTimes(2);
  });
});
