import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SPACE_COLORS } from '@tudu/core';
import { ColorPick } from './ColorPick';
import { CreateSpace } from './CreateSpace';
import { InviteField } from './InviteField';

describe('CreateSpace', () => {
  it('C08-U03 the tile follows the name and the colour; Create space is off without a name; Creating… then Created', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    render(<CreateSpace open inline onCreate={onCreate} initial={{ noFocus: true }} />);
    const dialog = screen.getByRole('dialog', { name: 'Create a space' });
    expect(
      within(dialog).getByText('Its own Tudu for a team: its own lists, Inbox and people.'),
    ).toBeInTheDocument();
    const create = within(dialog).getByRole('button', { name: 'Create space' });
    expect(create).toBeDisabled();
    const tile = dialog.querySelector('.tp-cs-tile')!;
    expect(tile).toHaveTextContent('N');
    expect(tile).toHaveStyle({ backgroundColor: 'rgb(78, 122, 107)' });
    await user.type(within(dialog).getByLabelText('Space name'), 'Design team');
    expect(tile).toHaveTextContent('DT');
    expect(create).toBeEnabled();
    await user.click(within(dialog).getByRole('radio', { name: SPACE_COLORS[4] }));
    expect(tile).toHaveStyle({ backgroundColor: 'rgb(160, 97, 61)' });
    expect(within(dialog).getByRole('radio', { name: SPACE_COLORS[4] })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(dialog).getByText('You can invite people later.')).toBeInTheDocument();
    await user.click(create);
    expect(onCreate).toHaveBeenCalledWith({
      name: 'Design team',
      color: SPACE_COLORS[4],
      initials: 'DT',
      invites: [],
    });
    expect(within(dialog).getByRole('button', { name: /Creating…/ })).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
    expect(within(dialog).getByRole('button', { name: /Created/ })).toHaveClass('tp-ok');
  });

  it('C08-U03 emails are taken on Enter, comma and blur; a bad address is marked and blocks Create; a duplicate is kept once', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<CreateSpace open inline onCreate={onCreate} initial={{ name: 'Northwind', noFocus: true }} />);
    const dialog = screen.getByRole('dialog', { name: 'Create a space' });
    const field = within(dialog).getByLabelText('Invite by email');
    await user.type(field, 'meera@x.y{Enter}');
    await user.type(field, 'arjun@x.y,');
    await user.type(field, 'Meera@x.y{Enter}');
    expect(dialog.querySelectorAll('.tp-invf-chip')).toHaveLength(2);
    expect(within(dialog).getByText('Invites go out when you create it.')).toBeInTheDocument();
    await user.type(field, 'nope');
    await user.tab();
    expect(dialog.querySelectorAll('.tp-invf-chip')).toHaveLength(3);
    expect(within(dialog).getByText('“nope” isn’t an email address.')).toBeInTheDocument();
    expect(dialog.querySelector('.tp-invf')).toHaveClass('tp-bad');
    expect(within(dialog).getByRole('button', { name: 'Create space' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Remove nope' }));
    expect(dialog.querySelector('.tp-invf')).not.toHaveClass('tp-bad');
    await user.click(within(dialog).getByRole('button', { name: 'Create space' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ invites: ['meera@x.y', 'arjun@x.y'] }));
  });

  it('C08-U03 the sheet form on phones: no Cancel in the foot, a full-size Create space', () => {
    render(<CreateSpace open inline variant="sheet" initial={{ noFocus: true }} />);
    const dialog = screen.getByRole('dialog', { name: 'Create a space' });
    expect(dialog).toHaveClass('tp-dlg-sheet');
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Create space' })).not.toHaveClass('tp-sm');
  });

  it('C08-U03 ColorPick is a radio group with a tick on the picked swatch; InviteField takes Backspace out', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPick value={SPACE_COLORS[0]} onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Colour' });
    expect(within(group).getAllByRole('radio')).toHaveLength(8);
    expect(within(group).getByRole('radio', { name: SPACE_COLORS[0] }).querySelector('svg')).not.toBeNull();
    await user.click(within(group).getByRole('radio', { name: SPACE_COLORS[2] }));
    expect(onChange).toHaveBeenCalledWith(SPACE_COLORS[2]);

    const onList = vi.fn();
    render(<InviteField defaultValue={['a@x.y']} onChange={onList} />);
    const field = screen.getByLabelText('Invite by email');
    expect(field).toHaveAttribute('placeholder', 'Add another');
    await user.click(field);
    await user.keyboard('{Backspace}');
    expect(onList).toHaveBeenLastCalledWith([]);
  });
});
