import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRules, readStylesheet } from '../test-utils/stylesheet';
import {
  QA_CLOSE_AFTER_MS,
  QA_LEAVE_MS,
  QA_LEAVE_PHONE_MS,
  QA_SIMILAR_AFTER_MS,
  QA_SIMILAR_FOLD_MS,
  QuickAdd,
  type QuickAddProps,
} from './QuickAdd';
import { ToastHost } from './Toast';

const rules = parseRules(readStylesheet('components.css'));
const TODAY = '2026-10-18';
const PROJECTS = [
  { id: 'nw', name: 'Northwind', color: '#3d5a80' },
  { id: 'pf', name: 'Platform', color: '#5b7553' },
];

function Bar(props: Partial<QuickAddProps>) {
  return (
    <>
      <QuickAdd open today={TODAY} projects={PROJECTS} {...props} />
      <ToastHost />
    </>
  );
}

const foot = () => document.querySelector('.tp-qa-lands')!.textContent;
const chip = (name: RegExp | string) => screen.getByRole('button', { name });

/** A drag or paste with files, as the browser hands them over. */
function withFiles(type: string, files: File[]) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const data = { types: ['Files'], files, getData: () => '' };
  Object.defineProperty(ev, 'dataTransfer', { value: data });
  Object.defineProperty(ev, 'clipboardData', { value: data });
  return ev;
}

afterEach(() => vi.useRealTimers());

describe('QuickAdd', () => {
  it('C04-U01 just opened: the line focused, Planned "Today" in the brand tone, Due and Project empty, "Lands on Today", Add task off', async () => {
    render(<Bar />);
    const line = screen.getByRole('textbox', { name: 'Task title' });
    await waitFor(() => expect(line).toHaveFocus());
    expect(line).toHaveAttribute('placeholder', 'What needs doing?');
    const planned = chip('Planned for: Today');
    expect(planned).toHaveTextContent('Today');
    expect(planned).toHaveClass('tp-qa-today');
    expect(chip('Add a due date')).toHaveClass('tp-qa-empty');
    expect(chip('Choose a project')).toHaveClass('tp-qa-empty');
    expect(foot()).toBe('Lands on Today');
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: 'Quick Add' })).toHaveClass('tp-qa-desk');
    expect(document.querySelector('.tp-qa-veil')).not.toBeNull();
    expect(document.querySelector('.tp-qa-layer')).toHaveClass('tp-qa-layer-bar');
  });

  it('C04-U02 Planned: Today, Tomorrow, Backlog and the calendar; the chip and the foot follow', async () => {
    const user = userEvent.setup();
    render(<Bar planned="2026-10-20" />);
    expect(chip('Planned for: Tue 20 Oct')).not.toHaveClass('tp-qa-today');
    expect(foot()).toBe('Lands on Tue 20 Oct');
    await user.click(chip('Planned for: Tue 20 Oct'));
    const pop = document.querySelector('.tp-qa-pop') as HTMLElement;
    expect(pop).not.toBeNull();
    await user.click(within(pop).getByRole('button', { name: 'Backlog' }));
    expect(chip('Planned for: Backlog')).toBeInTheDocument();
    expect(foot()).toBe('Lands in Backlog');
    expect(document.querySelector('.tp-qa-pop:not(.tp-pop-leaving)')).toBeNull();
    await user.click(chip('Planned for: Backlog'));
    await user.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('button', { name: 'Tomorrow' }),
    );
    expect(foot()).toBe('Lands on Tomorrow');
    await user.click(chip('Planned for: Tomorrow'));
    await user.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('button', { name: /23 October/ }),
    );
    expect(foot()).toBe('Lands on Fri 23 Oct');
    // the chip eases its width when its label changes
    expect(
      rules.some(
        (r) =>
          r.selector.includes('.tp-qa-chip.tp-sizing') && /width 220ms/.test(r.declarations.transition ?? ''),
      ),
    ).toBe(true);
  });

  it('C04-U03 Due: the hover hint says how far; the chip reads the date, red when overdue; Remove due date clears it', async () => {
    const user = userEvent.setup();
    render(<Bar />);
    await user.click(chip('Add a due date'));
    const pop = document.querySelector('.tp-qa-pop') as HTMLElement;
    expect(within(pop).getByText('Pick a due date')).toBeInTheDocument();
    await user.hover(within(pop).getByRole('button', { name: /22 October/ }));
    expect(within(pop).getByText('Thu 22 Oct · in 4 days')).toBeInTheDocument();
    await user.click(within(pop).getByRole('button', { name: /22 October/ }));
    expect(chip('Due Thu 22 Oct')).toHaveTextContent('Due Thu 22 Oct');
    expect(chip('Due Thu 22 Oct')).not.toHaveClass('tp-qa-od');
    expect(foot()).toBe('Lands on Today · due Thu 22 Oct');
    await user.click(chip('Due Thu 22 Oct'));
    await user.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('button', { name: /16 October/ }),
    );
    expect(chip('Due Fri 16 Oct')).toHaveClass('tp-qa-od');
    await user.click(chip('Due Fri 16 Oct'));
    await user.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('button', {
        name: 'Remove due date',
      }),
    );
    expect(chip('Add a due date')).toBeInTheDocument();
    expect(foot()).toBe('Lands on Today');
  });

  it('C04-U04 Project: the list with dots, No project, and New project… asks for a name and picks it', async () => {
    const user = userEvent.setup();
    const onNewProject = vi.fn(() => 'new-1');
    const { rerender } = render(<Bar onNewProject={onNewProject} />);
    await user.click(chip('Choose a project'));
    const pop = document.querySelector('.tp-qa-pop') as HTMLElement;
    const items = within(pop)
      .getAllByRole('menuitem')
      .map((m) => m.textContent);
    expect(items).toEqual(['Northwind', 'Platform', 'New project…']);
    expect(pop.querySelectorAll('.tp-dot')).toHaveLength(2);
    await user.click(within(pop).getByRole('menuitem', { name: 'Platform' }));
    expect(chip('Project: Platform')).toHaveTextContent('Platform');
    expect(foot()).toBe('Lands on Today · Platform');
    await user.click(chip('Project: Platform'));
    const pop2 = document.querySelector('.tp-qa-pop') as HTMLElement;
    expect(within(pop2).getByRole('menuitem', { name: /^Platform/ }).textContent).toContain('✓');
    await user.click(within(pop2).getByRole('menuitem', { name: 'No project' }));
    expect(chip('Choose a project')).toBeInTheDocument();
    await user.click(chip('Choose a project'));
    await user.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('menuitem', {
        name: 'New project…',
      }),
    );
    const field = screen.getByRole('textbox', { name: 'Project name' });
    expect(field).toHaveFocus();
    // The next unused colour is picked to start with.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Project colour' })).getByRole('radio', {
        checked: true,
      }),
    ).toHaveAccessibleName('Ochre');
    await user.type(field, ' Home {Enter}');
    expect(onNewProject).toHaveBeenCalledWith('Home', '#8a5a00');
    rerender(
      <Bar
        onNewProject={onNewProject}
        projects={[...PROJECTS, { id: 'new-1', name: 'Home', color: '#8a5a00' }]}
      />,
    );
    expect(chip('Project: Home')).toBeInTheDocument();
    expect(foot()).toBe('Lands on Today · Home');
  });

  it('C04-U27 the note is rich text: the formatting row shows while it has focus, "- " makes a list, Cmd+Enter adds, onSave gets clean HTML', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Bar onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveFocus());
    expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull();
    await user.keyboard('Plan the offsite');
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    await waitFor(() => expect(note).toHaveFocus());
    expect(note).toHaveAttribute('data-placeholder', 'Add a note');
    expect(screen.getByRole('button', { name: 'Add a note' })).toHaveAttribute('aria-pressed', 'true');
    const wrap = note.closest('.tp-rte')!;
    expect(wrap).toHaveClass('tp-rte-quick', 'tp-on');
    const bar = screen.getByRole('toolbar', { name: 'Note formatting' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Checklist', 'Link', 'Code']);
    await user.keyboard('- Venue{Enter}Food');
    expect(note.querySelector('ul > li')).not.toBeNull();
    expect(note.querySelectorAll('ul > li')).toHaveLength(2);
    expect(foot()).toBe('Lands on Today · note');
    // no limit of three lines any more
    await user.keyboard('{Enter}Travel{Enter}Budget');
    expect(note.querySelectorAll('ul > li')).toHaveLength(4);
    fireEvent.keyDown(note, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = (onSave.mock.calls[0] as unknown as [{ note: string }])[0].note;
    expect(sent).toBe(
      '<ul><li><p>Venue</p></li><li><p>Food</p></li><li><p>Travel</p></li><li><p>Budget</p></li></ul>',
    );
  });

  it('C04-U27 an empty note folds away when left; a note with words keeps its row (Add never moves); an old plain draft opens as paragraphs', async () => {
    const user = userEvent.setup();
    render(<Bar />);
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    await waitFor(() => expect(note).toHaveFocus());
    act(() => note.blur());
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull());
    expect(foot()).toBe('Lands on Today');
    // a draft kept before notes were rich: plain lines
    const kept = render(
      <QuickAdd
        open
        today={TODAY}
        projects={PROJECTS}
        initial={{ note: 'Bring the badge\n\nAnd the laptop' }}
      />,
    );
    const old = within(kept.container.ownerDocument.body).getAllByRole('textbox', { name: 'Note' }).at(-1)!;
    expect(old.innerHTML).toBe('<p>Bring the badge</p><p>And the laptop</p>');
    // words in it: the row stays put, so leaving the note for Add moves nothing
    expect(old).not.toHaveFocus();
    expect(old.closest('.tp-rte')).toHaveClass('tp-on');
  });

  it('C04-U27 phone: the row has Bold, the lists, Checklist and Link', async () => {
    const user = userEvent.setup();
    render(<Bar variant="sheet" />);
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    await waitFor(() => expect(note).toHaveFocus());
    const bar = screen.getByRole('toolbar', { name: 'Note formatting' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Bold', 'Bulleted list', 'Numbered list', 'Checklist', 'Link']);
    expect(note.closest('.tp-rte')).toHaveClass('tp-compact');
  });

  it('C04-U28 a file pasted or dropped on the note joins the files row, not the note', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn((file: File) =>
      Promise.resolve({ id: `att-${file.name}`, name: file.name, size: file.size }),
    );
    render(<Bar onUpload={onUpload} />);
    const dialog = screen.getByRole('dialog', { name: 'Quick Add' });
    await user.click(screen.getByRole('button', { name: 'Add a note' }));
    const note = screen.getByRole('textbox', { name: 'Note' });
    await waitFor(() => expect(note).toHaveFocus());
    await user.keyboard('See the map');
    const paste = withFiles('paste', [new File(['x'], 'venue-map.png', { type: 'image/png' })]);
    act(() => {
      note.dispatchEvent(paste);
    });
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const chips = () =>
      Array.from(dialog.querySelectorAll('.tp-qa-file')).map(
        (c) => c.querySelector('.tp-qa-fname')!.textContent,
      );
    await waitFor(() => expect(chips()).toEqual(['venue-map.png']));
    expect(note.querySelector('.tp-att, [data-tp-upload]')).toBeNull();
    expect(note.textContent).toBe('See the map');
    const drop = withFiles('drop', [new File(['y'], 'agenda.pdf')]);
    act(() => {
      note.dispatchEvent(drop);
    });
    await waitFor(() => expect(chips()).toEqual(['venue-map.png', 'agenda.pdf']));
    expect(note.textContent).toBe('See the map');
  });

  it('C04-U29 the opening focus waits its turn: a chip that already has the caret keeps it', () => {
    vi.useFakeTimers();
    render(<Bar />);
    const line = screen.getByRole('textbox', { name: 'Task title' });
    const project = chip('Choose a project');
    act(() => project.focus());
    act(() => vi.advanceTimersByTime(50));
    expect(project).toHaveFocus();
    expect(line).not.toHaveFocus();
  });

  it('C04-U29 the opening focus waits its turn: the New project name keeps the caret', () => {
    vi.useFakeTimers();
    render(<Bar onNewProject={() => 'new-1'} />);
    fireEvent.click(chip('Choose a project'));
    fireEvent.click(
      within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('menuitem', {
        name: 'New project…',
      }),
    );
    const name = within(screen.getByRole('group', { name: 'New project' })).getByRole('textbox', {
      name: 'Project name',
    });
    act(() => name.focus());
    act(() => vi.advanceTimersByTime(50));
    expect(name).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Task title' })).not.toHaveFocus();
  });

  it('C04-U06 files: the attach button, a paste and a drop add chips with their size; dropping shows the outline; × removes one', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn((file: File) =>
      Promise.resolve({ id: `att-${file.name}`, name: file.name, size: file.size }),
    );
    render(<Bar onUpload={onUpload} />);
    const dialog = screen.getByRole('dialog', { name: 'Quick Add' });
    const input = screen.getByLabelText('Choose files to attach') as HTMLInputElement;
    const pdf = new File([new Uint8Array(248_000)], 'offsite-agenda-v3.pdf', { type: 'application/pdf' });
    await user.upload(input, pdf);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    const chips = () => Array.from(dialog.querySelectorAll('.tp-qa-file')).map((c) => c.textContent);
    await waitFor(() => expect(chips()).toEqual(['offsite-agenda-v3.pdf242 KB']));
    expect(foot()).toBe('Lands on Today · 1 file');
    // a drop anywhere on the bar
    fireEvent(dialog, withFiles('dragenter', []));
    expect(dialog).toHaveClass('tp-qa-dropping');
    expect(screen.getByText('Drop to attach')).toBeInTheDocument();
    const png = new File([new Uint8Array(1_260_000)], 'venue-map.png', { type: 'image/png' });
    fireEvent(dialog, withFiles('drop', [png]));
    expect(dialog).not.toHaveClass('tp-qa-dropping');
    await waitFor(() => expect(chips()).toEqual(['offsite-agenda-v3.pdf242 KB', 'venue-map.png1.2 MB']));
    expect(foot()).toBe('Lands on Today · 2 files');
    // a paste
    fireEvent(
      screen.getByRole('textbox', { name: 'Task title' }),
      withFiles('paste', [new File(['x'], 'note.txt')]),
    );
    await waitFor(() => expect(chips()).toHaveLength(3));
    await user.click(screen.getByRole('button', { name: 'Remove venue-map.png' }));
    expect(chips()).toEqual(['offsite-agenda-v3.pdf242 KB', 'note.txt1 KB']);
    // a failed upload reads as failed and toasts
    const bad = vi.fn(() => Promise.reject(new Error('That file is too big. Files can be up to 25 MB.')));
    render(<QuickAdd open today={TODAY} projects={PROJECTS} onUpload={bad} />);
    const second = screen.getAllByRole('dialog', { name: 'Quick Add' })[1]!;
    await user.upload(within(second).getByLabelText('Choose files to attach'), new File(['x'], 'big.bin'));
    await waitFor(() => expect(within(second).getByText('failed')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('That file is too big. Files can be up to 25 MB.');
  });

  it('C04-U07 Add: Enter or the button; onSave gets the draft; "Adding…" holds the form, "Added", then onAdded and onClose; a rejected save keeps the draft', async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const onSave = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const onAdded = vi.fn();
    const onClose = vi.fn();
    render(<Bar onSave={onSave} onAdded={onAdded} onClose={onClose} planned="2026-10-19" />);
    const line = screen.getByRole('textbox', { name: 'Task title' });
    await user.type(line, 'Book the meeting room{Enter}');
    expect(onSave).toHaveBeenCalledWith({
      title: 'Book the meeting room',
      planned: '2026-10-19',
      due: null,
      projectId: null,
      note: '',
      attachments: [],
      from: null,
    });
    expect(screen.getByRole('dialog', { name: 'Quick Add' })).toHaveClass('tp-qa-saving');
    expect(line).toHaveAttribute('readonly');
    expect(foot()).toBe('Adding to Tomorrow…');
    resolve();
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Quick Add' })).toHaveClass('tp-qa-added'));
    expect(foot()).toBe('Added to Tomorrow');
    expect(onAdded).not.toHaveBeenCalled();
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1), { timeout: QA_CLOSE_AFTER_MS + 1000 });
    expect(onClose).toHaveBeenCalledTimes(1);

    const failing = vi.fn(() => Promise.reject(new Error('500')));
    render(<QuickAdd open today={TODAY} projects={PROJECTS} onSave={failing} />);
    const second = screen.getAllByRole('dialog', { name: 'Quick Add' })[1]!;
    const line2 = within(second).getByRole('textbox', { name: 'Task title' });
    await user.type(line2, 'Expense the team lunch');
    await user.click(within(second).getByRole('button', { name: 'Add task' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Couldn’t add the task. Your draft is still here.',
      ),
    );
    expect(line2).toHaveValue('Expense the team lunch');
    expect(second).not.toHaveClass('tp-qa-saving');
  });

  it('C04-U08 Esc closes a picker first, then the bar; × and the veil close it; the draft is still there when it opens again', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<QuickAdd open today={TODAY} projects={PROJECTS} onClose={onClose} />);
    const line = screen.getByRole('textbox', { name: 'Task title' });
    await user.type(line, 'Renew the domain');
    fireEvent.click(chip('Add a due date'));
    expect(document.querySelector('.tp-qa-pop')).not.toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.tp-qa-pop')).toHaveClass('tp-pop-leaving');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(document.querySelector('.tp-qa-veil')!);
    expect(onClose).toHaveBeenCalledTimes(3);
    // the page closes it: the bar eases out, then goes; opened again, the words are still there
    rerender(<QuickAdd open={false} today={TODAY} projects={PROJECTS} onClose={onClose} />);
    expect(document.querySelector('.tp-qa-layer')).toHaveClass('tp-leaving');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick Add' })).toBeNull(), {
      timeout: QA_LEAVE_MS + 1000,
    });
    rerender(<QuickAdd open today={TODAY} projects={PROJECTS} onClose={onClose} />);
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Renew the domain');
  });

  it('C04-U09 phone: the sheet with the grabber, the foot with the buttons and Add, pickers open upward, the keyboard moves the sheet', async () => {
    const user = userEvent.setup();
    render(<Bar variant="sheet" keyboard={291} />);
    const dialog = screen.getByRole('dialog', { name: 'Quick Add' });
    expect(dialog).toHaveClass('tp-qa-phone');
    expect(dialog.querySelector('.tp-qa-grabber')).not.toBeNull();
    expect(dialog.querySelector('.tp-qa-mark')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    const footEl = dialog.querySelector('.tp-qa-foot')!;
    expect(within(footEl as HTMLElement).getByRole('button', { name: 'Add a note' })).toBeInTheDocument();
    expect(within(footEl as HTMLElement).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(document.querySelector('.tp-qa-layer')).toHaveClass('tp-qa-layer-sheet');
    expect((document.querySelector('.tp-qa-layer') as HTMLElement).style.getPropertyValue('--qa-kb')).toBe(
      '291px',
    );
    await user.click(chip('Planned for: Today'));
    expect(document.querySelector('.tp-qa-pop')).toHaveClass('tp-qa-pop-up');
    const sheet = rules.find((r) => r.selector === '.tp-qa-layer-sheet .tp-qa')!;
    expect(sheet.declarations.bottom).toBe('var(--qa-kb, 0px)');
    expect(sheet.declarations.animation).toMatch(/tp-qa-up 260ms var\(--ease-settle\)/);
  });

  it('C04-U10 the bar arrives and leaves on the design’s clocks, and fades under reduced motion', () => {
    const bar = rules.find((r) => r.selector === '.tp-qa-layer-bar .tp-qa')!;
    expect(bar.declarations.animation).toMatch(/tp-qa-in 200ms var\(--ease-arrive\)/);
    expect(
      rules.find((r) => r.selector === '.tp-qa-layer-bar.tp-leaving .tp-qa')!.declarations.animation,
    ).toMatch(/tp-qa-out 150ms var\(--ease-leave\)/);
    expect(
      rules.find((r) => r.selector === '.tp-qa-layer-sheet.tp-leaving .tp-qa')!.declarations.animation,
    ).toMatch(/tp-qa-down 210ms/);
    expect(rules.find((r) => r.selector === '.tp-qa-veil')!.declarations.animation).toMatch(
      /tp-veil-in 160ms/,
    );
    const reduced = rules.filter(
      (r) =>
        r.context.some((c) => c.includes('prefers-reduced-motion')) && r.selector.includes('.tp-qa-layer'),
    );
    expect(reduced.some((r) => /tp-veil-in 120ms/.test(r.declarations.animation ?? ''))).toBe(true);
    expect(QA_LEAVE_MS).toBe(160);
    expect(QA_LEAVE_PHONE_MS).toBe(220);
  });

  it('C07-U07 looks like a task you have: asked after a pause (not under four letters), the closest with where, N more unfolds, × hides, the title opens it, Add never waits', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const similar = vi.fn(async (title: string) => {
      if (title === 'Run it') return [{ key: 'u', title: 'Run it again' }];
      if (title === 'Run the backfill') return [{ key: 'v', title: 'Run the backfill script' }];
      return title.startsWith('Run')
        ? [
            { key: 'q', title: 'Run the migration and backfill on staging', where: { label: 'Today' } },
            { key: 'r', title: 'Run the migration on production', where: { label: 'Tomorrow' } },
            { key: 's', title: 'Run the backfill', where: { label: 'Backlog' } },
            { key: 't', title: 'One too many' },
          ]
        : [];
    });
    const onOpenSimilar = vi.fn();
    const onSave = vi.fn();
    render(<Bar similar={similar} onOpenSimilar={onOpenSimilar} onSave={onSave} />);
    const line = screen.getByRole('textbox', { name: 'Task title' });
    await waitFor(() => expect(line).toHaveFocus());
    await user.type(line, 'Run');
    act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
    expect(similar).not.toHaveBeenCalled();
    await user.type(line, ' the migration');
    expect(similar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
    await waitFor(() => expect(similar).toHaveBeenCalledTimes(1));
    expect(similar).toHaveBeenCalledWith('Run the migration');
    const wrap = document.querySelector('.tp-qa-simwrap')!;
    await waitFor(() => expect(wrap).toHaveClass('tp-on'));
    expect(wrap.querySelector('.tp-qa-sim-k')!.textContent).toBe('Looks like tasks you have');
    const links = () => [...wrap.querySelectorAll('.tp-qa-sim-t')].map((b) => b.textContent);
    expect(links()).toEqual([
      'Run the migration and backfill on staging',
      'Run the migration on production',
      'Run the backfill',
    ]);
    expect(wrap.querySelector('.tp-qa-sim-w')!.textContent).toBe('Today');
    const more = screen.getByRole('button', { name: '2 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(wrap.querySelector('.tp-qa-sim-rest')).not.toHaveClass('tp-on');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(wrap.querySelector('.tp-qa-sim-rest')).toHaveClass('tp-on');
    await user.click(screen.getByRole('button', { name: 'Run the migration on production' }));
    expect(onOpenSimilar).toHaveBeenCalledWith(expect.objectContaining({ key: 'r' }));
    // Add never waits for it
    expect(screen.getByRole('button', { name: 'Add task' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'None of these' }));
    expect(wrap).not.toHaveClass('tp-on');
    expect(line).toHaveFocus();
    // a different title asks again and shows the line again; a short one clears it
    await user.clear(line);
    await user.type(line, 'Run it');
    act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
    await waitFor(() => expect(similar).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(wrap).toHaveClass('tp-on'));
    await user.clear(line);
    await user.type(line, 'Ru');
    expect(wrap).not.toHaveClass('tp-on');
    // one look-alike: the singular, no "more"
    await user.clear(line);
    await user.type(line, 'Run');
    await user.type(line, ' the backfill');
    act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
    await waitFor(() => expect(similar).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(wrap.querySelector('.tp-qa-sim-k')!.textContent).toBe('Looks like a task you have'),
    );
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
  });

  describe('the look-alikes fold away instead of snapping (focus-shift-and-sim-exit)', () => {
    const titles = () =>
      [...document.querySelectorAll('.tp-qa-simwrap .tp-qa-sim-t')].map((b) => b.textContent);
    const wrap = () => document.querySelector('.tp-qa-simwrap')!;
    const folded = () => fireEvent.transitionEnd(wrap(), { propertyName: 'grid-template-rows' });

    async function shown(similar: QuickAddProps['similar'], title: string) {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<Bar similar={similar} />);
      const line = screen.getByRole('textbox', { name: 'Task title' });
      await waitFor(() => expect(line).toHaveFocus());
      await user.type(line, title);
      act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
      await waitFor(() => expect(wrap()).toHaveClass('tp-on'));
      return { user, line };
    }

    it('FX-U01 after × the block folds with the last titles still in it, inert, until the fold ends', async () => {
      const { user } = await shown(
        async () => [
          { key: 'a', title: 'Fix the roof' },
          { key: 'b', title: 'Fix the roof tiles' },
        ],
        'Fix roof',
      );
      await user.click(screen.getByRole('button', { name: '1 more' }));
      await user.click(screen.getByRole('button', { name: 'None of these' }));
      expect(wrap()).not.toHaveClass('tp-on');
      expect(wrap()).toHaveAttribute('inert');
      expect(titles()).toEqual(['Fix the roof', 'Fix the roof tiles']);
      // "1 more" stays open while it folds, so it leaves the way it looked
      expect(wrap().querySelector('.tp-qa-sim-rest')).toHaveClass('tp-on');
      // another property ending is not the fold
      fireEvent.transitionEnd(wrap(), { propertyName: 'opacity' });
      expect(titles()).toHaveLength(2);
      folded();
      expect(wrap().querySelector('.tp-qa-sim')).toBeNull();
    });

    it('FX-U02 editing to no match, or under four letters, folds the same way; a later match shows its own titles', async () => {
      const similar = vi.fn(async (t: string) =>
        t.startsWith('Fix')
          ? [{ key: 'a', title: 'Fix the roof' }]
          : t.startsWith('Paint')
            ? [{ key: 'p', title: 'Paint the fence' }]
            : [],
      );
      const { user, line } = await shown(similar, 'Fix roof');
      // no match
      await user.clear(line);
      await user.type(line, 'Water plants');
      act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
      await waitFor(() => expect(wrap()).not.toHaveClass('tp-on'));
      expect(titles()).toEqual(['Fix the roof']);
      folded();
      expect(titles()).toEqual([]);
      // under four letters
      await user.clear(line);
      await user.type(line, 'Fix roof');
      act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
      await waitFor(() => expect(wrap()).toHaveClass('tp-on'));
      await user.clear(line);
      await user.type(line, 'Fi');
      expect(wrap()).not.toHaveClass('tp-on');
      expect(titles()).toEqual(['Fix the roof']);
      // a new match mid-fold takes over at once
      await user.clear(line);
      await user.type(line, 'Paint it');
      act(() => vi.advanceTimersByTime(QA_SIMILAR_AFTER_MS + 20));
      await waitFor(() => expect(titles()).toEqual(['Paint the fence']));
      expect(wrap()).toHaveClass('tp-on');
    });

    it('FX-U03 the folded titles leave even if the fold never reports its end', async () => {
      const { user } = await shown(async () => [{ key: 'a', title: 'Fix the roof' }], 'Fix roof');
      await user.click(screen.getByRole('button', { name: 'Not the same task' }));
      expect(titles()).toEqual(['Fix the roof']);
      act(() => vi.advanceTimersByTime(QA_SIMILAR_FOLD_MS - 50));
      expect(titles()).toEqual(['Fix the roof']);
      act(() => vi.advanceTimersByTime(100));
      expect(wrap().querySelector('.tp-qa-sim')).toBeNull();
    });
  });

  it('C07-U07 words handed in become the title; the kit line opens already shown', () => {
    const { rerender, unmount } = render(<Bar seed={{ title: 'Gutters', nonce: 1 }} />);
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Gutters');
    rerender(<Bar seed={{ title: 'Roof', nonce: 2 }} />);
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Roof');
    unmount();
    render(
      <Bar
        initial={{
          noFocus: true,
          title: 'Fix roof',
          similar: [{ key: 'a', title: 'Fix the roof', where: { label: 'Backlog' } }],
        }}
      />,
    );
    expect(document.querySelector('.tp-qa-simwrap')).toHaveClass('tp-on');
    expect(document.querySelector('.tp-qa-sim-k')!.textContent).toBe('Looks like a task you have');
    expect(document.querySelector('.tp-qa-sim-w')!.textContent).toBe('Backlog');
  });

  describe('New project… in the picker (new project flow)', () => {
    async function nameCard(user: ReturnType<typeof userEvent.setup>) {
      await user.click(chip('Choose a project'));
      await user.click(
        within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('menuitem', {
          name: 'New project…',
        }),
      );
      return screen.getByRole('group', { name: 'New project' });
    }

    it('C18-U16 a swatch picked in the name card is the colour Add makes it with; the dot in the field follows it', async () => {
      const user = userEvent.setup();
      const onNewProject = vi.fn(() => 'new-1');
      render(<Bar onNewProject={onNewProject} />);
      const card = await nameCard(user);
      await user.click(within(card).getByRole('radio', { name: 'Plum' }));
      expect((card.querySelector('.tp-pm-field i') as HTMLElement).style.background).toBe(
        'rgb(122, 78, 122)',
      );
      await user.type(within(card).getByRole('textbox', { name: 'Project name' }), 'Errands');
      await user.click(within(card).getByRole('button', { name: 'Add' }));
      expect(onNewProject).toHaveBeenCalledWith('Errands', '#7a4e7a');
    });

    it('C18-U17 a name that is already a project offers it: "Platform is already here.", Use Platform; Enter picks it and makes nothing', async () => {
      const user = userEvent.setup();
      const onNewProject = vi.fn(() => 'new-1');
      render(<Bar onNewProject={onNewProject} />);
      const card = await nameCard(user);
      expect(within(card).getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(card).toHaveTextContent('Its colour, here or later in Settings.');
      await user.type(within(card).getByRole('textbox', { name: 'Project name' }), ' platform');
      expect(card).toHaveTextContent('Platform is already here.');
      expect(within(card).getByRole('button', { name: 'Use Platform' })).toBeEnabled();
      await user.keyboard('{Enter}');
      expect(onNewProject).not.toHaveBeenCalled();
      expect(chip('Project: Platform')).toBeInTheDocument();
    });

    it('C18-U18 ‹ and Esc go back to the list without closing the picker or making anything', async () => {
      const user = userEvent.setup();
      const onNewProject = vi.fn(() => 'new-1');
      render(<Bar onNewProject={onNewProject} />);
      let card = await nameCard(user);
      await user.type(within(card).getByRole('textbox', { name: 'Project name' }), 'Garden');
      await user.click(within(card).getByRole('button', { name: 'Back to projects' }));
      const pop = document.querySelector('.tp-qa-pop') as HTMLElement;
      expect(within(pop).getByRole('menuitem', { name: 'New project…' })).toBeInTheDocument();
      await user.click(within(pop).getByRole('menuitem', { name: 'New project…' }));
      card = screen.getByRole('group', { name: 'New project' });
      expect(within(card).getByRole('textbox', { name: 'Project name' })).toHaveValue('');
      await user.keyboard('{Escape}');
      expect(
        within(document.querySelector('.tp-qa-pop') as HTMLElement).getByRole('menuitem', {
          name: 'Platform',
        }),
      ).toBeInTheDocument();
      expect(onNewProject).not.toHaveBeenCalled();
    });
  });
});
