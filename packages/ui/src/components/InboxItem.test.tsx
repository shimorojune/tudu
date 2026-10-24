import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { readStylesheet } from '../test-utils/stylesheet';
import { InboxItem, InboxSection, type InboxEntry } from './InboxItem';

const TODAY = '2026-10-18';
const MEERA = { id: 'm', name: 'Meera Nair', initials: 'MN', color: '#3d5a80' };
const REQUEST: InboxEntry = {
  id: 'r1',
  kind: 'request',
  who: MEERA,
  when: 'Thu 10:12',
  unread: true,
  task: {
    key: 'r1',
    title: 'Draft the onboarding copy',
    forLabel: 'Tue 20 Oct',
    forIso: '2026-10-20',
    due: { label: 'Fri' },
    project: { name: 'Northwind', color: '#3d5a80' },
    note: 'Keep it short.',
  },
};
const COMMENT: InboxEntry = {
  id: 'c1',
  kind: 'comment',
  who: MEERA,
  when: 'Just now',
  unread: true,
  text: 'commented on',
  quote: '<p>Can I take the <b>second</b> half?</p>',
  task: { key: 't1', title: 'Write the release notes', where: 'Today' },
};
const ANSWER: InboxEntry = {
  id: 'a1',
  kind: 'answer',
  who: MEERA,
  when: '09:40',
  text: 'accepted your task onto Fri 16 Oct',
  task: { key: 't2', title: 'Plan the retro', where: 'Fri 16 Oct' },
};
const SENT: InboxEntry = {
  id: 's1',
  kind: 'sent',
  to: MEERA,
  when: 'Wed',
  task: {
    key: 's1',
    title: 'Book the venue',
    forLabel: 'Tue 20 Oct',
    forIso: '2026-10-20',
    note: 'Somewhere near.',
  },
  status: { state: 'waiting', seen: '1h ago' },
};
const cal = { today: TODAY, marks: {} };

describe('InboxItem', () => {
  it('C08-U10 a request: sender, title, the day asked for, the project and note; Accept opens the picker with the asked day; it reports the day or the Backlog', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(<InboxItem item={REQUEST} mode="full" calendar={cal} onAccept={onAccept} />);
    const item = screen.getByRole('article', { name: 'Meera sent you Draft the onboarding copy' });
    expect(item).toHaveClass('tp-ix', 'tp-ix-full', 'tp-ix-req', 'tp-unread');
    expect(within(item).getByText('Meera').tagName).toBe('B');
    expect(within(item).getByText('Thu 10:12')).toHaveClass('tp-ix-when');
    expect(within(item).getByText('Draft the onboarding copy')).toHaveClass('tp-ix-title');
    expect(within(item).getByText('For Tue 20 Oct')).toBeInTheDocument();
    expect(within(item).getByText('Due Fri')).toBeInTheDocument();
    expect(within(item).getByText('Northwind')).toBeInTheDocument();
    expect(within(item).getByText('Keep it short.')).toHaveClass('tp-ix-note');
    // no dot in the reading pane
    expect(within(item).queryByLabelText('New')).toBeNull();
    await user.click(within(item).getByRole('button', { name: 'Accept' }));
    const pop = screen.getByRole('dialog', { name: 'Accept it onto…' });
    expect(within(pop).getByRole('button', { name: /^20 October/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(pop).getByTestId('calendar-hint')).toHaveTextContent('Accept onto Tue 20 Oct');
    await user.click(within(pop).getByRole('button', { name: 'Tomorrow' }));
    expect(onAccept).toHaveBeenCalledWith(REQUEST, '2026-10-19');
    await user.click(within(item).getByRole('button', { name: 'Accept' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Accept it onto…' })).getByRole('button', {
        name: 'Backlog',
      }),
    );
    expect(onAccept).toHaveBeenLastCalledWith(REQUEST, null);
  });

  it('C08-U10 Decline opens the reason; Send stays off until there is one; Cancel and Esc close it; it reports', async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();
    render(<InboxItem item={REQUEST} mode="full" calendar={cal} onDecline={onDecline} />);
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    const box = screen.getByRole('textbox', { name: 'Reason for declining' });
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('placeholder', 'Why? Meera will see this.');
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    await user.type(box, '   ');
    expect(send).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Reason for declining' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await user.type(screen.getByRole('textbox', { name: 'Reason for declining' }), 'Priya owns this now.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onDecline).toHaveBeenCalledWith(REQUEST, 'Priya owns this now.');
  });

  it('C08-U10 a comment: the whole comment in the pane, the reply reports and clears, Open task; an answer update; the compact list line', async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(
      <InboxItem item={COMMENT} mode="full" calendar={cal} onReply={onReply} onOpen={onOpen} />,
    );
    expect(screen.getByText('commented on')).toBeInTheDocument();
    expect(screen.getByText('Write the release notes', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('second').tagName).toBe('B');
    const reply = screen.getByRole('textbox', { name: 'Reply to Meera' });
    const btn = screen.getByRole('button', { name: 'Reply' });
    expect(btn).toBeDisabled();
    await user.type(reply, 'Yes, take it.');
    await user.click(btn);
    expect(onReply).toHaveBeenCalledWith(COMMENT, 'Yes, take it.');
    expect(reply).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Open task' }));
    expect(onOpen).toHaveBeenCalledWith(COMMENT);
    rerender(<InboxItem item={ANSWER} mode="full" calendar={cal} onOpen={onOpen} />);
    expect(screen.getByText('accepted your task onto Fri 16 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    // the list line: one line, the dot while new, picking reports
    const onSelect = vi.fn();
    rerender(<InboxItem item={COMMENT} mode="list" selected calendar={cal} onSelect={onSelect} />);
    const line = screen.getByRole('article');
    expect(line).toHaveClass('tp-ix-list', 'tp-sel');
    expect(within(line).getByLabelText('New')).toHaveClass('tp-ix-dot');
    expect(within(line).getByText(/Can I take the/)).toHaveClass('tp-ix-quote');
    await user.click(within(line).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(COMMENT);
  });

  it('C08-U10 answered: what you did on its own line and no Accept or Decline; Open task for an accepted one', () => {
    const { rerender } = render(
      <InboxItem
        item={{ ...REQUEST, unread: false, outcome: { status: 'accepted', label: 'Fri 16 Oct' } }}
        mode="full"
        calendar={cal}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/You accepted it onto/)).toBeInTheDocument();
    expect(screen.getByText('Fri 16 Oct', { selector: 'b' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open task' })).toBeInTheDocument();
    rerender(
      <InboxItem
        item={{ ...REQUEST, outcome: { status: 'declined', reason: 'Priya owns this.' } }}
        mode="full"
        calendar={cal}
      />,
    );
    expect(screen.getByText(/You declined/).closest('.tp-ix-oc')).toHaveClass('tp-dec');
    expect(screen.getByText(': Priya owns this.')).toHaveClass('tp-ix-ocr');
    expect(screen.queryByRole('button', { name: 'Open task' })).toBeNull();
  });

  it('C08-U10 a sent row: Waiting with Seen, Take it back and Do it myself; accepted with Open task; declined with the reason', async () => {
    const user = userEvent.setup();
    const onWithdraw = vi.fn();
    const onTakeBack = vi.fn();
    const onOpen = vi.fn();
    const onPerson = vi.fn();
    const { rerender } = render(
      <InboxItem
        item={SENT}
        mode="full"
        calendar={cal}
        onWithdraw={onWithdraw}
        onTakeBack={onTakeBack}
        onOpen={onOpen}
        onPerson={onPerson}
      />,
    );
    expect(screen.getByRole('article', { name: 'You sent Meera Book the venue' })).toBeInTheDocument();
    expect(screen.getByText('Asked for Tue 20 Oct')).toBeInTheDocument();
    expect(screen.getByText('Waiting for Meera · seen 1h ago').closest('.tp-ix-oc')).toHaveClass('tp-wait');
    await user.click(screen.getByRole('button', { name: 'Take it back' }));
    expect(onWithdraw).toHaveBeenCalledWith(SENT);
    await user.click(screen.getByRole('button', { name: 'Do it myself' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Put it on your list' })).getByRole('button', {
        name: 'Today',
      }),
    );
    expect(onTakeBack).toHaveBeenCalledWith(SENT, TODAY);
    rerender(
      <InboxItem
        item={{ ...SENT, status: { state: 'accepted', label: 'Mon 19 Oct' } }}
        mode="full"
        calendar={cal}
        onOpen={onOpen}
        onPerson={onPerson}
      />,
    );
    expect(screen.getByText(/Meera accepted it onto/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See Meera’s week' }));
    expect(onPerson).toHaveBeenCalledWith(MEERA);
    await user.click(screen.getByRole('button', { name: 'Open task' }));
    expect(onOpen).toHaveBeenCalled();
    rerender(
      <InboxItem
        item={{ ...SENT, status: { state: 'declined', reason: 'Booked already.' } }}
        mode="full"
        calendar={cal}
        hideTo
      />,
    );
    expect(screen.getByText('You sent this')).toBeInTheDocument();
    expect(screen.getByText(/Meera declined/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Do it myself' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take it back' })).toBeInTheDocument();
  });

  it('C08-U09 a section: the mono heading with its count, the quiet action, the rows keyed; the fold mode unfolds in place', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onToggle = vi.fn();
    render(
      <InboxSection
        title="Updates"
        count={2}
        action="Mark all as read"
        onAction={onAction}
        items={[COMMENT, ANSWER]}
        mode="fold"
        openKey="c1"
        calendar={cal}
        onToggle={onToggle}
      />,
    );
    const sec = screen.getByRole('region', { name: 'Updates' });
    expect(within(sec).getByText('Updates').closest('.tp-ixs-head')).toHaveTextContent('Updates2');
    await user.click(within(sec).getByRole('button', { name: 'Mark all as read' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(within(sec).getAllByRole('listitem')).toHaveLength(2);
    const [open, shut] = within(sec).getAllByRole('article');
    expect(open).toHaveClass('tp-open');
    expect(open!.querySelector('.tp-ix-more')).toHaveClass('tp-on');
    expect(shut).not.toHaveClass('tp-open');
    await user.click(within(shut!).getByRole('button', { expanded: false }));
    expect(onToggle).toHaveBeenCalledWith(ANSWER, true);
  });
});

const APP: InboxEntry = {
  id: 'app-0.38.0',
  kind: 'app',
  when: 'Just now',
  unread: true,
  text: 'is ready: version 0.38.0',
  quote: '<p><strong>Features</strong></p><ul><li>The floating bar keeps your draft</li></ul>',
  task: { title: '' },
};

describe('InboxItem, a new version (chunk 11)', () => {
  it('C11-U02 the app kind: the mark, the ready line, the notes; What’s new and Restart to update in the reading pane', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<InboxItem item={APP} mode="list" onSelect={onSelect} />);
    const row = screen.getByRole('article', { name: 'Tudu is ready: version 0.38.0' });
    // The mark as the avatar, the line with the name, the notes as the quote (plain in the list), the dot.
    expect(row.querySelector('.tp-ix-av-app [role="img"][aria-label="Tudu"]')).toBeTruthy();
    expect(row.querySelector('.tp-ix-text')!.textContent).toBe('Tudu is ready: version 0.38.0');
    expect(row.querySelector('.tp-ix-quote')!.textContent).toContain('The floating bar keeps your draft');
    expect(within(row).getByLabelText('New')).toBeTruthy();
    await user.click(within(row).getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(APP);

    // Fold mode says See what's new.
    const onOpen = vi.fn();
    rerender(<InboxItem item={{ ...APP, unread: false }} mode="fold" open onOpen={onOpen} />);
    expect(screen.queryByLabelText('New')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'See what’s new' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    // The reading pane: What's new reports; Restart to update reports once, says Restarting… and stays busy.
    const onUpdate = vi.fn();
    rerender(<InboxItem item={APP} mode="full" onOpen={onOpen} onUpdate={onUpdate} />);
    expect(screen.getByRole('article').querySelector('.tp-ix-quote li')!.textContent).toBe(
      'The floating bar keeps your draft',
    );
    await user.click(screen.getByRole('button', { name: 'What’s new' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Restart to update' }));
    const busy = screen.getByRole('button', { name: /Restarting…/ });
    await user.click(busy);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Restarting…/ })).toBeTruthy();

    // A Staging build names itself.
    rerender(
      <InboxItem item={{ ...APP, id: 'app-s', who: { name: 'Tudu Staging', initials: 'T' } }} mode="list" />,
    );
    expect(screen.getByRole('article', { name: 'Tudu Staging is ready: version 0.38.0' })).toBeTruthy();
  });

  it('C11-U02 a restart that fails frees the button', async () => {
    const user = userEvent.setup();
    let fail: (e: Error) => void = () => {};
    const onUpdate = vi.fn(() => new Promise((_, reject) => (fail = reject)));
    render(<InboxItem item={APP} mode="full" onUpdate={onUpdate} />);
    await user.click(screen.getByRole('button', { name: 'Restart to update' }));
    expect(screen.getByRole('button', { name: /Restarting…/ })).toBeTruthy();
    fail(new Error('no'));
    expect(await screen.findByRole('button', { name: 'Restart to update' })).toBeTruthy();
  });
});

describe('InboxItem, one Inbox (unified)', () => {
  it('C08-U15 new rows: tp-unread, the dot and a bold name; read rows: no dot and quiet; neither uses --selection', () => {
    const { container, rerender } = render(
      <InboxItem item={{ ...COMMENT, space: 'Northwind' }} mode="list" />,
    );
    const row = container.querySelector('article')!;
    expect(row).toHaveClass('tp-ix-list', 'tp-unread');
    expect(row.querySelector('.tp-ix-dot')).toHaveAttribute('aria-label', 'New');
    rerender(<InboxItem item={{ ...COMMENT, unread: false }} mode="list" />);
    expect(row).not.toHaveClass('tp-unread');
    expect(row.querySelector('.tp-ix-dot')).toBeNull();
    // the kit's stylesheet: rows wash in ink, never the brand selection
    const css = readStylesheet('components.css');
    const rowRules = css.split('\n').filter((l) => /tp-ix-(head|list)/.test(l) && /background/.test(l));
    expect(rowRules.length).toBeGreaterThan(2);
    for (const l of rowRules) expect(l).not.toMatch(/--selection|--brand/);
  });

  it('C08-U16 hover actions: Mark as read or unread, and Delete; a request still to answer has no Delete', async () => {
    const user = userEvent.setup();
    const onToggleRead = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(
      <InboxItem item={COMMENT} mode="list" onToggleRead={onToggleRead} onDelete={onDelete} />,
    );
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    expect(onToggleRead).toHaveBeenCalledWith(COMMENT);
    rerender(
      <InboxItem
        item={{ ...COMMENT, unread: false }}
        mode="list"
        onToggleRead={onToggleRead}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole('button', { name: 'Mark as unread' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    rerender(<InboxItem item={REQUEST} mode="list" onToggleRead={onToggleRead} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
    // answered requests can go
    rerender(
      <InboxItem
        item={{ ...REQUEST, outcome: { status: 'declined', reason: 'Busy' } }}
        mode="list"
        onDelete={onDelete}
      />,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('C08-U17 an invite: Join and Not now; a notice: its words and only Delete; the byline names the space', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn(() => Promise.reject(new Error('ended')));
    const onNotNow = vi.fn();
    const invite: InboxEntry = {
      id: 'v1',
      kind: 'invite',
      who: { name: 'Sana Qureshi', initials: 'SQ', color: '#8a5a00' },
      when: '2h',
      unread: true,
      task: { title: 'Design Guild' },
    };
    const { container, rerender } = render(<InboxItem item={invite} mode="list" />);
    expect(container.querySelector('.tp-ix-text')).toHaveTextContent('Sana invited you to Design Guild');
    expect(container.querySelector('article')).toHaveClass('tp-ix-inv');
    rerender(<InboxItem item={invite} mode="full" onJoin={onJoin} onNotNow={onNotNow} />);
    const join = screen.getByRole('button', { name: 'Join Design Guild' });
    await user.click(join);
    expect(onJoin).toHaveBeenCalledWith(invite);
    // a join that fails frees the button
    await waitFor(() => expect(screen.getByRole('button', { name: 'Join Design Guild' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onNotNow).toHaveBeenCalledWith(invite);

    const onDelete = vi.fn();
    const notice: InboxEntry = {
      id: 'n1',
      kind: 'notice',
      mark: { name: 'Pilot Farm', initials: 'PF', color: '#5b7553' },
      when: 'Fri',
      text: 'was deleted',
      task: { title: 'Pilot Farm' },
    };
    rerender(<InboxItem item={notice} mode="full" onDelete={onDelete} />);
    expect(container.querySelector('.tp-ix-text')).toHaveTextContent('Pilot Farm was deleted');
    expect(container.querySelector('.tp-ix-av')).toHaveTextContent('PF');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Delete']);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(notice);
    rerender(
      <InboxItem
        item={{ ...notice, who: { name: 'Arjun Kumar', initials: 'AK' }, text: 'removed you from' }}
        mode="list"
      />,
    );
    expect(container.querySelector('.tp-ix-text')).toHaveTextContent('Arjun removed you from Pilot Farm');
    rerender(<InboxItem item={{ ...COMMENT, space: 'Northwind' }} mode="list" />);
    expect(container.querySelector('.tp-ix-by')).toHaveTextContent('NorthwindToday');
  });

  it('C08-U18 swipe: past 40% of the row deletes, short of it springs back; a request still to answer never swipes', async () => {
    const onDelete = vi.fn();
    const { container, rerender } = render(
      <InboxItem item={COMMENT} mode="list" swipe onDelete={onDelete} />,
    );
    const row = container.querySelector('article')!;
    Object.defineProperty(row, 'offsetWidth', { value: 300, configurable: true });
    const slide = row.querySelector('.tp-ix-slide') as HTMLElement;
    expect(row.querySelector('.tp-ix-swipe-bg')).toHaveTextContent('Delete');
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 280, clientY: 40 });
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 200, clientY: 42 });
    expect(slide.style.transform).toBe('translateX(-80px)');
    fireEvent.pointerUp(row, { pointerType: 'touch' });
    expect(slide.style.transform).toBe('');
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.pointerDown(row, { pointerType: 'touch', clientX: 280, clientY: 40 });
    fireEvent.pointerMove(row, { pointerType: 'touch', clientX: 120, clientY: 40 });
    fireEvent.pointerUp(row, { pointerType: 'touch' });
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(COMMENT));
    rerender(<InboxItem item={REQUEST} mode="list" swipe onDelete={onDelete} />);
    expect(container.querySelector('.tp-ix-slide')).toBeNull();
    expect(within(container).queryByText('Delete')).toBeNull();
  });
});
