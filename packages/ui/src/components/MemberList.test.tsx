import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterField } from './FilterField';
import { MemberList, type MemberListPerson } from './MemberList';
import { PersonHeader } from './PersonHeader';
import { PersonRow } from './PersonRow';
import { TaskLine, type SharedTask } from './TaskLine';

const PEOPLE: MemberListPerson[] = [
  { id: 'r', name: 'Rohit Raj', email: 'rohit@x.y', initials: 'RR', you: true, count: 3 },
  { id: 'm', name: 'Meera Nair', email: 'meera@x.y', initials: 'MN', color: '#3d5a80', count: 5 },
  { id: 'a', name: 'Arjun Rao', email: 'arjun@x.y', initials: 'AR' },
];

describe('People parts', () => {
  it('C08-U06 the list: Everyone first with its line, then every member with their count, You marked; picking reports; the empty line', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const { rerender } = render(
      <MemberList
        people={PEOPLE}
        active={null}
        allLabel="Everyone"
        allSub="8 shared this week"
        onPick={onPick}
      />,
    );
    const list = screen.getByRole('list', { name: 'People' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent('Everyone');
    expect(rows[0]).toHaveTextContent('8 shared this week');
    expect(rows[0]).toHaveClass('tp-on');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByText('Members')).toHaveClass('tp-ml-h');
    expect(rows[1]).toHaveTextContent('Rohit Raj');
    expect(rows[1]!.querySelector('.tp-prow-you')).toHaveTextContent('You');
    expect(rows[1]!.querySelector('.tp-ml-c')).toHaveTextContent('3');
    expect(rows[2]!.querySelector('.tp-ml-sub')).toHaveTextContent('meera@x.y');
    expect(rows[3]!.querySelector('.tp-ml-c')).toBeNull();
    await user.click(rows[2]!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'm' }));
    // the picked row takes the wash; Everyone reports null
    rerender(
      <MemberList
        people={PEOPLE}
        active="m"
        allLabel="Everyone"
        allSub="8 shared this week"
        onPick={onPick}
      />,
    );
    expect(within(list).getByRole('listitem', { name: 'Meera Nair' })).toHaveClass('tp-on');
    expect(within(list).getByRole('listitem', { name: 'Everyone' })).not.toHaveClass('tp-on');
    await user.click(within(list).getByRole('listitem', { name: 'Everyone' }));
    expect(onPick).toHaveBeenLastCalledWith(null);
    // the same person again reports nothing
    await user.click(within(list).getByRole('listitem', { name: 'Meera Nair' }));
    expect(onPick).toHaveBeenCalledTimes(2);
    // a search that finds no one
    rerender(<MemberList people={[]} active={null} empty="No one called “Zed” in Northwind." />);
    expect(screen.getByText('No one called “Zed” in Northwind.')).toHaveClass('tp-ml-none');
  });

  it('C08-U06 Find someone: the pill field reports every key, × clears and keeps the focus, Esc clears', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterField placeholder="Find someone" onChange={onChange} />);
    const box = screen.getByRole('searchbox', { name: 'Find someone' });
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toHaveClass('tp-hide');
    await user.type(box, 'mee');
    expect(onChange).toHaveBeenLastCalledWith('mee');
    expect(clear).not.toHaveClass('tp-hide');
    expect(box.closest('.tp-ff')).toHaveClass('tp-has');
    await user.click(clear);
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(box).toHaveFocus();
    await user.type(box, 'ar');
    await user.keyboard('{Escape}');
    expect(box).toHaveValue('');
  });

  it('C08-U06 a shared task line, a person’s row with "N more", and the person header', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const tasks: SharedTask[] = [
      {
        key: 'a',
        title: 'Pay the electricity bill',
        done: true,
        project: { name: 'Home', color: '#8a5a00' },
      },
      { key: 'b', title: 'Write the release notes', due: { label: 'Due Fri', overdue: true } },
      { key: 'c', title: 'Three' },
      { key: 'd', title: 'Four' },
      { key: 'e', title: 'Five', from: 'you' },
    ];
    render(<TaskLine task={tasks[0]!} who={{ name: 'Meera Nair', initials: 'MN' }} onOpen={onOpen} />);
    const line = screen.getByRole('button', { name: 'Done: Pay the electricity bill' });
    expect(line).toHaveClass('tp-tl', 'tp-done');
    expect(line.querySelector('.tp-tl-box')).toHaveClass('tp-on');
    expect(line.querySelector('.tp-tl-by')).toHaveTextContent('Home');
    expect(line.querySelector('.tp-tl-who')).toHaveTextContent('Meera');
    await user.click(line);
    expect(onOpen).toHaveBeenCalledWith(tasks[0]);

    const onPerson = vi.fn();
    render(
      <PersonRow
        person={{ name: 'Arjun Rao', email: 'arjun@x.y', initials: 'AR' }}
        tasks={tasks}
        onOpen={onPerson}
        onOpenTask={onOpen}
      />,
    );
    const row = screen.getByRole('region', { name: 'Arjun Rao' });
    expect(row.querySelector('.tp-prow-c')).toHaveTextContent('1 of 5 done');
    expect(row.querySelectorAll('.tp-tl')).toHaveLength(4);
    expect(within(row).getByText('Due Fri')).toHaveClass('tp-od');
    await user.click(within(row).getByRole('button', { name: '1 more' }));
    expect(onPerson).toHaveBeenCalledTimes(1);
    await user.click(row.querySelector('.tp-prow-head')!);
    expect(onPerson).toHaveBeenCalledTimes(2);

    render(
      <PersonHeader
        person={{ name: 'Meera Nair', email: 'meera@x.y', initials: 'MN' }}
        sub="meera@x.y · Northwind"
      >
        <button type="button">Send Meera a task</button>
      </PersonHeader>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Meera Nair' })).toHaveClass('tp-ph-name');
    expect(screen.getByText('meera@x.y · Northwind')).toHaveClass('tp-ph-sub');
    expect(screen.getByRole('button', { name: 'Send Meera a task' }).closest('.tp-ph-tools')).not.toBeNull();
    const empty = render(<PersonRow person={{ name: 'Zed', initials: 'Z' }} tasks={[]} />);
    expect(empty.container.querySelector('.tp-prow-c')).toHaveTextContent('Nothing shared');
  });
});
