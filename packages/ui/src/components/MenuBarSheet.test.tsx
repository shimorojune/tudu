import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenuBarSheet, type MenuBarGroupItem } from './MenuBarSheet';

const heading = { eyebrow: 'Today · Week 43', day: 'Friday', date: '23 October' };
const personal: MenuBarGroupItem = {
  key: 'p',
  name: 'Personal',
  space: { name: 'Personal', personal: true },
  rows: [
    { key: 'a', title: 'Book the dentist', carried: { label: 'Sat' } },
    { key: 'b', title: 'Send the invoice', done: true, due: { label: 'Mon', overdue: true } },
    { key: 'c', title: 'Review the deck', project: { name: 'Launch', color: '#c2410c' }, jira: 'NW-12' },
  ],
};
const northwind: MenuBarGroupItem = {
  key: 'n',
  name: 'Northwind',
  space: { name: 'Northwind', initials: 'NW', color: '#2f6f5e' },
  rows: [{ key: 'd', title: 'Ship the brief' }],
};

describe('C20-U02 MenuBarSheet', () => {
  it('C20-U02 one space is one plain list: no headings, the ring counts the day', () => {
    render(<MenuBarSheet state="day" heading={heading} groups={[personal]} />);
    expect(screen.getByText('Friday')).toBeTruthy();
    expect(screen.getByText('Today · Week 43')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Today in Personal' })).toBeTruthy();
    expect(screen.queryByText('1 of 3')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('img', { name: /1 of 3/ })).toBeTruthy();
  });

  it('C20-U02 two spaces: each is headed with its name and its own count, in the order given', () => {
    render(<MenuBarSheet state="day" heading={heading} groups={[personal, northwind]} />);
    const lists = screen.getAllByRole('list');
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Today in Personal',
      'Today in Northwind',
    ]);
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('0 of 1')).toBeTruthy();
    expect(screen.getByRole('img', { name: /1 of 4/ })).toBeTruthy();
  });

  it('C20-U02 the foot: New task and New note icons, Open Tudu, and ⋯ with Send feedback… and Quit', async () => {
    const user = userEvent.setup();
    const on = {
      onNew: vi.fn(),
      onNewNote: vi.fn(),
      onOpenApp: vi.fn(),
      onFeedback: vi.fn(),
      onQuit: vi.fn(),
    };
    render(<MenuBarSheet state="day" heading={heading} groups={[personal]} appName="Tudu Staging" {...on} />);
    const newTask = screen.getByRole('button', { name: 'New task' });
    expect(newTask).toHaveAttribute('aria-keyshortcuts', 'Meta+Shift+N');
    expect(newTask).toHaveClass('tp-ib');
    expect(newTask.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'New note' })).toHaveClass('tp-ib');
    const open = screen.getByRole('button', { name: 'Open Tudu Staging' });
    expect(open).toHaveTextContent(/^Open Tudu$/);
    await user.click(newTask);
    await user.click(screen.getByRole('button', { name: 'New note' }));
    await user.click(open);
    expect(on.onNew).toHaveBeenCalledOnce();
    expect(on.onNewNote).toHaveBeenCalledOnce();
    expect(on.onOpenApp).toHaveBeenCalledOnce();
    expect(screen.queryByText('⌘⇧N')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items[0]).toContain('Send feedback…');
    expect(items[1]).toContain('Quit Tudu Staging');
    await user.click(screen.getByRole('menuitem', { name: /Send feedback/ }));
    expect(on.onFeedback).toHaveBeenCalledOnce();
  });

  it('C20-U02 signed out: the sentence, Open Tudu, and ⋯ with Quit alone', async () => {
    const user = userEvent.setup();
    const onQuit = vi.fn();
    render(<MenuBarSheet state="signed-out" onQuit={onQuit} />);
    expect(screen.getByText('Sign in to see your day.')).toBeTruthy();
    expect(screen.getByText('Your tasks show here once you are signed in on this Mac.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Tudu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^New task/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New note' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    await user.click(items[0]!);
    expect(onQuit).toHaveBeenCalledOnce();
  });
});

describe('C20-U03 MenuBarSheet', () => {
  it('C20-U03 the empty state says only what is true', () => {
    const { rerender } = render(
      <MenuBarSheet
        state="empty"
        heading={heading}
        emptyLines={['Tomorrow has 3.', 'The Backlog has 12 waiting for a day.']}
      />,
    );
    expect(screen.getByText('Nothing planned for today.')).toBeTruthy();
    expect(screen.getByText('Tomorrow has 3. The Backlog has 12 waiting for a day.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New task' })).toBeTruthy();
    rerender(<MenuBarSheet state="empty" heading={heading} emptyLines={[]} />);
    expect(screen.queryByText(/Tomorrow has/)).toBeNull();
    expect(screen.queryByRole('img', { name: /of/ })).toBeNull();
  });

  it('C20-U03 offline adds the line under the head', () => {
    const { rerender } = render(<MenuBarSheet state="day" heading={heading} groups={[personal]} />);
    expect(screen.queryByText('Ticks save here and go when you’re back.')).toBeNull();
    rerender(<MenuBarSheet state="day" heading={heading} groups={[personal]} offline />);
    expect(screen.getByText('You’re offline.')).toBeTruthy();
    expect(screen.getByText('Ticks save here and go when you’re back.')).toBeTruthy();
  });

  it('C20-U03 a row: the byline as Today writes it; a tick and a title click each say which row', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    render(
      <MenuBarSheet state="day" heading={heading} groups={[personal]} onToggle={onToggle} onOpen={onOpen} />,
    );
    const [a, b, c] = screen.getAllByRole('listitem');
    expect(within(a!).getByText('From Sat')).toBeTruthy();
    expect(within(b!).getByText('Overdue').className).toContain('tp-od');
    expect(b!.className).toContain('tp-done');
    expect(within(c!).getByText('Launch')).toBeTruthy();
    expect(within(c!).getByText('NW-12')).toBeTruthy();
    await user.click(within(a!).getByRole('checkbox', { name: 'Book the dentist' }));
    expect(onToggle).toHaveBeenCalledWith(personal.rows[0], true);
    await user.click(screen.getByRole('button', { name: 'Open Review the deck in Tudu' }));
    expect(onOpen).toHaveBeenCalledWith(personal.rows[2]);
  });
});

describe('C11-U14 MenuBarSheet › updates', () => {
  it('C11-U14 ⋯ starts with Check for updates…, then Send feedback… and Quit', async () => {
    const user = userEvent.setup();
    const onCheck = vi.fn();
    render(<MenuBarSheet state="empty" heading={heading} update={{ onCheck }} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items[0]).toBe('Check for updates…');
    expect(items[1]).toContain('Send feedback…');
    expect(items[2]).toContain('Quit Tudu');
    await user.click(screen.getByRole('menuitem', { name: 'Check for updates…' }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it('C11-U14 with a version ready it reads Restart to update, the version as its hint', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<MenuBarSheet state="empty" heading={heading} update={{ ready: '0.37.1', onRestart }} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    const first = screen.getAllByRole('menuitem')[0]!;
    expect(first).toHaveTextContent('Restart to update');
    expect(first).toHaveTextContent('0.37.1');
    await user.click(first);
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('C11-U14 without update (an older app), or signed out, there is no such item', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<MenuBarSheet state="empty" heading={heading} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByRole('menuitem', { name: /update/ })).toBeNull();
    unmount();
    render(<MenuBarSheet state="signed-out" update={{ onCheck: vi.fn() }} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Quit'),
    ]);
  });
});

describe('C20-U07 MenuBarSheet', () => {
  it('C20-U07 the foot icons say what they do in a tooltip above: New task with its shortcut, New note', async () => {
    const user = userEvent.setup();
    render(
      <MenuBarSheet state="day" heading={heading} groups={[personal]} shortcut="⌘⇧N" onNewNote={vi.fn()} />,
    );
    act(() => screen.getByRole('button', { name: 'New task' }).focus());
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('New task ⌘⇧N'));
    const pop = document.querySelector('.tp-tip-pop');
    expect(pop).toHaveAttribute('data-side', 'top');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(/^New note$/));
  });
});

describe('C20-U08 MenuBarSheet', () => {
  it('C20-U08 empty: New task stays in the body, the foot has New note but no New task icon', () => {
    const { rerender } = render(<MenuBarSheet state="empty" heading={heading} onNewNote={vi.fn()} />);
    const newTask = screen.getAllByRole('button', { name: 'New task' });
    expect(newTask).toHaveLength(1);
    expect(newTask[0]).toHaveClass('tp-btn-primary');
    expect(newTask[0]!.closest('.tp-mb-empty')).not.toBeNull();
    const foot = document.querySelector('.tp-mb-f') as HTMLElement;
    expect(within(foot).getByRole('button', { name: 'New note' })).toBeTruthy();
    rerender(<MenuBarSheet state="empty" heading={heading} />);
    expect(screen.queryByRole('button', { name: 'New note' })).toBeNull();
  });
});
