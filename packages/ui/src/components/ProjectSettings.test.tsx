import { render, screen, within } from '@testing-library/react';
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
  render(<ProjectSettings projects={PROJECTS} {...fns} {...over} />);
  return fns;
}
const editor = () => screen.getByRole('group', { name: /^(New project|Edit .+)$/ });

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
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Hiring{Enter}');
    expect(fns.onCreate).toHaveBeenCalledWith('Hiring', PROJECT_COLORS[0]);
  });

  it('C18-U02 New project opens the editor at the top with the name focused and the next unused colour; Create reports both; Esc closes', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    const list = screen.getByRole('list', { name: 'Projects' });
    expect(list.firstElementChild).toBe(editor());
    const name = screen.getByRole('textbox', { name: 'Project name' });
    expect(name).toHaveFocus();
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled();
    const create = screen.getByRole('button', { name: 'Create project' });
    expect(create).toBeDisabled();
    const picked = within(screen.getByRole('radiogroup', { name: 'Project colour' })).getByRole('radio', {
      checked: true,
    });
    expect(picked).toHaveAttribute('aria-label', expect.any(String));
    await user.type(name, '  Hiring ');
    await user.click(create);
    expect(fns.onCreate).toHaveBeenCalledWith('Hiring', PROJECT_COLORS[2]);
    expect(screen.queryByRole('group')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group')).toBeNull();
    expect(fns.onCreate).toHaveBeenCalledTimes(1);
  });

  it('C18-U03 a row opens its editor with its name and colour; Save reports only what changed; an empty or unchanged name keeps Save off', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'Edit Onboarding, 5 open tasks' }));
    expect(editor()).toHaveAccessibleName('Edit Onboarding');
    const name = screen.getByRole('textbox', { name: 'Project name' });
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
    await user.clear(screen.getByRole('textbox', { name: 'Project name' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), 'Offsite 2027{Enter}');
    expect(fns.onRename).toHaveBeenCalledWith(PROJECTS[1], 'Offsite 2027');
    expect(fns.onRecolour).toHaveBeenCalledTimes(1);
  });

  it('C18-U04 one editor at a time; Delete project and ⋯ › Delete report it; the preview is the byline as it will read', async () => {
    const user = userEvent.setup();
    const fns = mount();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    await user.click(screen.getByRole('button', { name: 'Edit Onboarding, 5 open tasks' }));
    expect(screen.getAllByRole('group')).toHaveLength(1);
    const prev = screen.getByLabelText('On a task');
    expect(prev.textContent).toBe('On a taskTomorrowOnboarding5 open tasks');
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' week');
    expect(prev.textContent).toContain('Onboarding week');
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(fns.onDelete).toHaveBeenCalledWith(PROJECTS[0]);
    expect(screen.queryByRole('group')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More for Offsite' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(fns.onDelete).toHaveBeenLastCalledWith(PROJECTS[1]);
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
