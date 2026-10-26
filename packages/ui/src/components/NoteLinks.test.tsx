import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteLinks } from './NoteLinks';

const NOTES = [
  { id: 'interviews', title: 'Onboarding interview notes', where: 'Northwind', edited: '1h', links: 2 },
];
const ALL = [
  { key: 'interviews', title: 'Onboarding interview notes', sub: 'Northwind · 1h' },
  { key: 'agenda', title: 'Offsite agenda draft', sub: 'Northwind / Planning / Offsite · 4m' },
];

describe('C22-U18 notes in the task panel', () => {
  it('C22-U18 lists linked notes with count and time at the right edge; × unlinks', async () => {
    const user = userEvent.setup();
    const onUnlink = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <NoteLinks
        notes={NOTES}
        all={ALL}
        onUnlink={onUnlink}
        onOpen={onOpen}
        onLink={() => {}}
        onNew={() => {}}
      />,
    );
    const sec = screen.getByRole('region', { name: 'From your notebook' });
    expect(sec).toHaveTextContent('Only you see these');
    expect(within(sec).getByRole('heading')).toHaveTextContent('1');
    const row = within(sec).getByRole('button', { name: /Onboarding interview notes/ });
    expect(row.querySelector('.tp-nb-row-ln')).toHaveTextContent('2');
    expect(row.querySelector('.tp-nb-row-time')).toHaveTextContent('1h');
    await user.click(row);
    expect(onOpen).toHaveBeenCalledWith(NOTES[0]);
    await user.click(screen.getByRole('button', { name: 'Unlink from this task' }));
    expect(container.querySelector('.tp-nb-li')).toHaveClass('tp-nb-li-out');
    await waitFor(() => expect(onUnlink).toHaveBeenCalledWith(NOTES[0]));
  });

  it('C22-U18 Link a note marks already linked notes', async () => {
    const user = userEvent.setup();
    const onLink = vi.fn();
    render(<NoteLinks notes={NOTES} all={ALL} onLink={onLink} />);
    await user.click(screen.getByRole('button', { name: 'Link a note' }));
    const picker = screen.getByRole('dialog', { name: 'Link a note' });
    const linked = within(picker).getByRole('option', { name: /Onboarding/ });
    expect(linked).toHaveTextContent('Linked');
    await user.click(linked);
    expect(onLink).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link a note' })).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Link a note' }));
    await user.click(screen.getByRole('option', { name: /Offsite agenda draft/ }));
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ key: 'agenda' }));
  });

  it('C22-U18 the error line offers Try again', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<NoteLinks notes={[]} error onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your notes for this task didn’t load.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
