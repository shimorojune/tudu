import { EmptyState, InboxItem, InboxSection, QuickAdd, type InboxEntry } from '@tudu/ui';
import { Pair, Section } from './Pair';

const TODAY = '2026-10-18';
const MEERA = { id: 'm', name: 'Meera Nair', initials: 'MN', color: '#3d5a80' };
const ARJUN = { id: 'a', name: 'Arjun Rao', initials: 'AR', color: '#5b7553' };
const NW = { name: 'Northwind', color: '#3d5a80' };
const cal = { today: TODAY, marks: {} };

const REQUEST: InboxEntry = {
  id: 'r1',
  kind: 'request',
  who: MEERA,
  when: 'Thu 10:12',
  unread: true,
  task: {
    title: 'Draft the onboarding copy for the new pilot customers',
    forLabel: 'Tue 20 Oct',
    forIso: '2026-10-20',
    due: { label: 'Fri' },
    project: NW,
    note: 'Keep it short. Two paragraphs at most, and a line on what changed since the last round.',
  },
};
const REQUEST2: InboxEntry = {
  id: 'r2',
  kind: 'request',
  who: ARJUN,
  when: 'Wed',
  unread: false,
  task: { title: 'Book the offsite venue', forLabel: null, forIso: null },
};
const COMMENT: InboxEntry = {
  id: 'c1',
  kind: 'comment',
  who: ARJUN,
  when: 'Just now',
  unread: true,
  text: 'commented on',
  quote:
    '<p>Can I take the <b>second</b> half? I have the afternoon free and the notes are mostly mine anyway.</p>',
  task: { title: 'Write the release notes', where: 'Today' },
};
const ANSWER: InboxEntry = {
  id: 'a1',
  kind: 'answer',
  who: MEERA,
  when: '09:40',
  text: 'accepted your task onto Fri 16 Oct',
  task: { title: 'Plan the retro', where: 'Fri 16 Oct' },
};
const ANSWERED: InboxEntry[] = [
  { ...REQUEST, id: 'd1', unread: false, outcome: { status: 'accepted', label: 'Fri 16 Oct' } },
  { ...REQUEST2, id: 'd2', outcome: { status: 'declined', reason: 'Priya owns the billing pages now.' } },
];
const SENT: InboxEntry[] = [
  {
    id: 's1',
    kind: 'sent',
    to: MEERA,
    when: 'Wed',
    task: {
      title: 'Book the venue',
      forLabel: 'Tue 20 Oct',
      forIso: '2026-10-20',
      note: 'Somewhere near the office.',
    },
    status: { state: 'waiting', seen: '1h ago' },
  },
  {
    id: 's2',
    kind: 'sent',
    to: ARJUN,
    when: 'Tue',
    task: { title: 'Plan the retro', forLabel: 'Thu 22 Oct' },
    status: { state: 'accepted', label: 'Thu 22 Oct' },
  },
  {
    id: 's3',
    kind: 'sent',
    to: MEERA,
    when: 'Mon',
    task: { title: 'Review the pricing page', forLabel: null },
    status: { state: 'declined', reason: 'Booked already, and the copy is yours.' },
  },
];
const noop = () => {};

/** The Inbox's parts and states, and Quick Add in its send mode, light and dark. */
export function InboxStates() {
  return (
    <Section
      id="inbox"
      title="The Inbox"
      lead="One Inbox per space, no bell: what people send you, and updates on your tasks. Like mail: the list on the left, the picked item in full on the right."
    >
      <Pair
        title="The list"
        note="To answer, then Updates with Mark all as read. An ink dot while it is new; the picked row takes the wash."
        render={() => (
          <div style={{ width: 'min(380px, 100%)' }}>
            <InboxSection
              title="To answer"
              count={2}
              items={[REQUEST, REQUEST2]}
              mode="list"
              selectedKey="r1"
              calendar={cal}
              onSelect={noop}
            />
            <InboxSection
              title="Updates"
              action="Mark all as read"
              onAction={noop}
              items={[COMMENT, ANSWER]}
              mode="list"
              calendar={cal}
              onSelect={noop}
            />
          </div>
        )}
      />
      <Pair
        title="Reading a request"
        note="The note from the sender, then Decline and Accept (a day picker, the asked day preselected)."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <InboxItem item={REQUEST} mode="full" calendar={cal} onAccept={noop} onDecline={noop} />
          </div>
        )}
      />
      <Pair
        title="Declining"
        note="Why? Meera will see this. Send stays off until there is a reason."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <InboxItem
              item={REQUEST}
              mode="full"
              calendar={cal}
              onDecline={noop}
              initial={{ declining: true, reason: 'Priya owns the billing pages now.' }}
            />
          </div>
        )}
      />
      <Pair
        title="A comment, answered here"
        note="The whole comment, a reply field and Open task."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <InboxItem
              item={COMMENT}
              mode="full"
              calendar={cal}
              onReply={noop}
              onOpen={noop}
              initial={{ reply: 'Yes, take it. The notes are in the shared folder.' }}
            />
          </div>
        )}
      />
      <Pair
        title="Answered"
        note="What you did, on its own line; Open task stays for the ones you took."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <InboxSection
              title="Answered"
              items={ANSWERED}
              mode="fold"
              openKey="d1"
              calendar={cal}
              onOpen={noop}
              onToggle={noop}
            />
          </div>
        )}
      />
      <Pair
        title="Sent"
        note="Where each stands: Waiting (seen once they opened it), accepted onto a day, or declined with the reason; Take it back and Do it myself."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <InboxSection
              title="Sent"
              items={SENT}
              mode="fold"
              openKey="s1"
              calendar={cal}
              onWithdraw={noop}
              onTakeBack={noop}
              onOpen={noop}
              onPerson={noop}
              onToggle={noop}
            />
          </div>
        )}
      />
      <Pair
        title="All caught up"
        note="The list says it, with a quiet way to what you answered; the pane stays blank paper."
        render={() => (
          <div style={{ width: 'min(380px, 100%)' }}>
            <EmptyState
              title="All caught up."
              icon="inbox"
              action="See what you answered"
              plain
              onAction={noop}
            >
              Tasks people send you and updates on your tasks land here.
            </EmptyState>
          </div>
        )}
      />
      <Pair
        title="Quick Add: for someone"
        note="The top line names the space and the person; the chip reads “Asks for Tue” and the button Send."
        render={() => (
          <QuickAdd
            layer="none"
            open
            today={TODAY}
            projects={[]}
            initial={{ noFocus: true, title: 'Draft the onboarding copy', planned: '2026-10-20' }}
            send={{
              spaces: [
                { id: 'me', name: 'Personal', personal: true },
                { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N' },
              ],
              spaceId: 'nw',
              onSpace: noop,
              people: [MEERA, ARJUN],
              to: MEERA,
              onTo: noop,
              me: { name: 'Rohit Raj', initials: 'RR' },
              canSend: true,
            }}
          />
        )}
      />
    </Section>
  );
}
