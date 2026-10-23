import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuickAdd, type QuickAddProps, type QuickAddSend } from './QuickAdd';
import { ToastHost } from './Toast';

const TODAY = '2026-10-18';
const ME = { name: 'Rohit Raj', initials: 'RR' };
const MEERA = { id: 'm', name: 'Meera Nair', email: 'meera@x.y', initials: 'MN', color: '#3d5a80' };
const ARJUN = { id: 'a', name: 'Arjun Rao', email: 'arjun@x.y', initials: 'AR' };
const SPACES = [
  { id: 'me', name: 'Personal', personal: true, initials: 'P' },
  { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N' },
];

function sendProps(over: Partial<QuickAddSend> = {}): QuickAddSend {
  return {
    spaces: SPACES,
    spaceId: 'nw',
    onSpace: vi.fn(),
    people: [MEERA, ARJUN],
    to: null,
    onTo: vi.fn(),
    me: ME,
    canSend: true,
    ...over,
  };
}

function Bar(props: Partial<QuickAddProps>) {
  return (
    <>
      <QuickAdd open today={TODAY} projects={[]} initial={{ noFocus: true }} {...props} />
      <ToastHost />
    </>
  );
}
const foot = () => document.querySelector('.tp-qa-lands')!.textContent;

describe('Quick Add: the top line', () => {
  it('C08-U08 reads "In Northwind for Me"; the space menu lists your spaces and the person menu the members with Me first', async () => {
    const user = userEvent.setup();
    const send = sendProps();
    render(<Bar send={send} />);
    const bar = screen.getByRole('dialog', { name: 'New task' });
    expect(bar).toHaveClass('tp-qa-send');
    const line = bar.querySelector('.tp-qa-toline')!;
    expect(line.textContent).toMatch(/^In.*Northwind.*for.*Me/);
    await user.click(within(bar).getByRole('button', { name: 'Space: Northwind' }));
    const spaces = screen.getByRole('menu', { name: 'Which space' });
    expect(
      within(spaces)
        .getAllByRole('menuitemradio')
        .map((m) => m.textContent),
    ).toEqual(['Personal', 'NNorthwind']);
    expect(within(spaces).getByRole('menuitemradio', { name: /Northwind/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(within(spaces).getByRole('menuitemradio', { name: /Personal/ }));
    expect(send.onSpace).toHaveBeenCalledWith('me');
    await user.click(within(bar).getByRole('button', { name: 'Who it’s for' }));
    const people = screen.getByRole('menu', { name: 'Who it’s for' });
    const rows = within(people).getAllByRole('menuitemradio');
    expect(rows.map((r) => r.textContent)).toEqual([
      'RRMeOn your list in Northwind',
      'MNMeera Nairmeera@x.y',
      'ARArjun Raoarjun@x.y',
    ]);
    expect(rows[0]).toHaveAttribute('aria-checked', 'true');
    await user.click(rows[1]!);
    expect(send.onTo).toHaveBeenCalledWith(MEERA);
    // the ordinary foot and button while it is for you
    expect(foot()).toBe('Lands on Today');
    expect(within(bar).getByRole('button', { name: 'Add task' })).toBeInTheDocument();
  });

  it('C08-U08 with a person the chip reads "Asks for Tue", the button Send and the foot says whose Inbox; the result carries space and person', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <Bar
        send={sendProps({ to: MEERA })}
        onSave={onSave}
        initial={{ noFocus: true, planned: '2026-10-20', title: 'Draft the onboarding copy' }}
      />,
    );
    const bar = screen.getByRole('dialog', { name: 'New task' });
    expect(bar).toHaveClass('tp-qa-for');
    expect(within(bar).getByRole('button', { name: 'Asks for: Tue 20 Oct' })).toHaveTextContent(
      'Asks for Tue 20 Oct',
    );
    expect(within(bar).getByRole('button', { name: 'For Meera Nair' })).toHaveTextContent('Meera Nair');
    expect(foot()).toBe('Goes to Meera’s Inbox in Northwind. Meera picks the day');
    const send = within(bar).getByRole('button', { name: 'Send' });
    await user.click(send);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Draft the onboarding copy',
        planned: '2026-10-20',
        spaceId: 'nw',
        toId: 'm',
      }),
    );
    expect(await within(bar).findByRole('button', { name: /Sent/ })).toHaveClass('tp-ok');
    expect(foot()).toBe('Sent to Meera');
  });

  it('C08-U08 "No day asked" with the Backlog picked; no person menu in Personal, the chip reads Me and stays put', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Bar send={sendProps({ to: MEERA })} initial={{ noFocus: true, planned: null }} />,
    );
    expect(screen.getByRole('button', { name: 'Asks for: Backlog' })).toHaveTextContent('No day asked');
    rerender(<Bar send={sendProps({ spaceId: 'me', canSend: false, people: [] })} />);
    const bar = screen.getByRole('dialog', { name: 'New task' });
    expect(within(bar).queryByRole('button', { name: 'Who it’s for' })).toBeNull();
    expect(within(bar).getByLabelText('For you')).toHaveTextContent('Me');
    await user.click(within(bar).getByRole('button', { name: 'Space: Personal' }));
    expect(screen.getByRole('menu', { name: 'Which space' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /^Planned for:/ })).toBeInTheDocument();
  });
});

describe('Quick Add: always says where (chunk 17)', () => {
  it('C17-U01 Personal alone reads "In Personal for Me" with plain chips: no buttons, no menus, Tab goes to the title', async () => {
    const user = userEvent.setup();
    const send = sendProps({ spaces: [SPACES[0]!], spaceId: 'me', people: [], canSend: false });
    render(<Bar send={send} />);
    const bar = screen.getByRole('dialog', { name: 'Quick Add' });
    const line = bar.querySelector('.tp-qa-toline')!;
    expect(line.textContent).toMatch(/^In.*Personal.*for.*Me/);
    expect(within(bar).queryByRole('button', { name: /^Space:/ })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Who it’s for' })).toBeNull();
    expect(line.querySelectorAll('.tp-qa-static-chip')).toHaveLength(2);
    await user.click(within(line as HTMLElement).getByText('Personal'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(send.onSpace).not.toHaveBeenCalled();
    const title = within(bar).getByRole('textbox', { name: 'Task title' });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.tab();
    expect(document.activeElement).toBe(title);
  });

  it('C17-U02 two spaces: the space chip opens the list and the person chip the people; picking Meera changes the placeholder', async () => {
    const user = userEvent.setup();
    const send = sendProps();
    const { rerender } = render(<Bar send={send} />);
    const bar = screen.getByRole('dialog', { name: 'New task' });
    await user.click(within(bar).getByRole('button', { name: 'Space: Northwind' }));
    expect(screen.getByRole('menu', { name: 'Which space' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    rerender(<Bar send={sendProps({ to: MEERA })} />);
    expect(within(bar).getByRole('textbox', { name: 'Task title' })).toHaveAttribute(
      'placeholder',
      'What should Meera do?',
    );
  });

  it('C17-U03 a team space joining turns the plain chips into buttons without losing the draft', async () => {
    const user = userEvent.setup();
    const alone = sendProps({ spaces: [SPACES[0]!], spaceId: 'me', people: [], canSend: false });
    const { rerender } = render(<Bar send={alone} />);
    const title = screen.getByRole('textbox', { name: 'Task title' });
    await user.type(title, 'Renew passport');
    rerender(<Bar send={sendProps({ spaceId: 'me', canSend: false })} />);
    expect(screen.getByRole('button', { name: 'Space: Personal' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue('Renew passport');
  });
});
