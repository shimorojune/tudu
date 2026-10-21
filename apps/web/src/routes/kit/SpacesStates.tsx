import {
  CreateSpace,
  FilterField,
  JoinCard,
  MemberList,
  MembersCard,
  PersonHeader,
  PersonRow,
  SpaceSwitch,
  TaskLine,
  type JoinInvite,
  type SwitchSpace,
} from '@tudu/ui';
import { Pair, Section } from './Pair';

const SPACES: SwitchSpace[] = [
  { id: 'me', name: 'Personal', personal: true, sub: 'Just you' },
  { id: 'nw', name: 'Northwind', color: '#3d5a80', initials: 'N', sub: '19 people', count: 5 },
  { id: 'ds', name: 'Design team', color: '#7a4e7e', initials: 'DT', sub: '4 people' },
];
const MEERA = { id: 'm', name: 'Meera Nair', email: 'meera@northwind.io', initials: 'MN', color: '#3d5a80' };
const ARJUN = { id: 'a', name: 'Arjun Rao', email: 'arjun@northwind.io', initials: 'AR', color: '#5b7553' };
const PRIYA = { id: 'p', name: 'Priya Shah', email: 'priya@northwind.io', initials: 'PS', color: '#8a5a00' };
const ME = { id: 'r', name: 'Rohit Raj', email: 'rohit@northwind.io', initials: 'RR', you: true };
const INVITE: JoinInvite = {
  space: { name: 'Northwind', color: '#3d5a80', initials: 'N' },
  from: { name: 'Rohit Raj' },
  count: 7,
  people: [
    MEERA,
    ARJUN,
    PRIYA,
    ME,
    { id: 'x', name: 'Sam Lee', initials: 'SL' },
    { id: 'y', name: 'Dev', initials: 'D' },
  ],
};
const noop = () => {};

/** The switcher, Create a space, the Members card, Join Northwind and the People parts, light and dark. */
export function SpacesStates() {
  return (
    <Section
      id="spaces"
      title="Spaces and People"
      lead="Each space is its own Tudu. The name at the top opens the list; People is where a team's tasks meet."
    >
      <Pair
        title="The space switcher"
        note="The space's tile and name open the list: a quiet line each, “5 new” on another space, a tick on this one, Create a space at the foot."
        render={() => (
          <div style={{ height: 300 }}>
            <SpaceSwitch spaces={SPACES} active="me" defaultOpen onPick={noop} onCreate={noop} />
          </div>
        )}
      />
      <Pair
        title="Create a space"
        note="The tile follows the name and the colour; people to invite are optional."
        render={() => (
          <CreateSpace
            open
            inline
            onClose={noop}
            initial={{ name: 'Northwind', color: '#3d5a80', invites: ['meera@northwind.io'], noFocus: true }}
          />
        )}
      />
      <Pair
        title="Members"
        note="You and the people in the space with their role, the email line with Invite, then the invites still waiting with Cancel."
        render={() => (
          <MembersCard
            open
            inline
            spaceName="Northwind"
            members={[
              { ...ME, role: 'admin' },
              { ...MEERA, role: 'member' },
              { ...ARJUN, role: 'member' },
            ]}
            invites={[{ id: 'i1', email: 'priya@northwind.io', when: '2 days ago' }]}
            onInvite={noop}
            onCancelInvite={noop}
            initial={{ noFocus: true }}
          />
        )}
      />
      <Pair
        title="Join Northwind"
        note="From an invite's link, signed in: who asked, who is in, one button."
        render={() => <JoinCard invite={INVITE} state="open" onJoin={noop} />}
      />
      <Pair
        title="Join: the link is dead"
        note="Expired, taken back, or you are already in."
        render={() => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <JoinCard invite={INVITE} state="expired" onOpen={noop} />
            <JoinCard invite={INVITE} state="member" onOpen={noop} />
          </div>
        )}
      />
      <Pair
        title="People: the list"
        note="Everyone first with how many tasks are shared this week, then every member with their count; Find someone narrows it."
        render={() => (
          <div style={{ width: 300 }}>
            <div style={{ padding: '0 8px 8px' }}>
              <FilterField placeholder="Find someone" />
            </div>
            <MemberList
              people={[{ ...ME, count: 3 }, { ...MEERA, count: 5 }, { ...ARJUN, count: 2 }, { ...PRIYA }]}
              active="m"
              allLabel="Everyone"
              allSub="10 shared this week"
              onPick={noop}
            />
          </div>
        )}
      />
      <Pair
        title="People: shared tasks"
        note="A colleague's task is a line you can open to read and comment, never tick. By person, each member's rows fold under their name."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <TaskLine
              task={{
                key: 'a',
                title: 'Sync with Meera on onboarding copy',
                project: { name: 'Northwind', color: '#3d5a80' },
              }}
              who={MEERA}
              onOpen={noop}
            />
            <TaskLine
              task={{
                key: 'b',
                title: 'Pay the electricity bill',
                done: true,
                project: { name: 'Home', color: '#8a5a00' },
              }}
              who={ARJUN}
              onOpen={noop}
            />
            <TaskLine
              task={{
                key: 'c',
                title: 'Write the release notes',
                due: { label: 'Overdue since Fri', overdue: true },
              }}
              who={PRIYA}
              onOpen={noop}
            />
            <PersonRow
              person={MEERA}
              tasks={[
                { key: 'd', title: 'Meera’s Quick Add demo', due: { label: 'Due Tue' } },
                { key: 'e', title: 'Draft the Q4 hiring plan', done: true },
                { key: 'f', title: 'Book flights for the offsite' },
                { key: 'g', title: 'Plan the team offsite agenda' },
                { key: 'h', title: 'Northwind retro' },
              ]}
              onOpen={noop}
              onOpenTask={noop}
            />
          </div>
        )}
      />
      <Pair
        title="People: one person"
        note="Their name in the serif, the quiet line, and the tools row."
        render={() => (
          <div style={{ width: 'min(560px, 100%)' }}>
            <PersonHeader person={MEERA} sub="meera@northwind.io" />
          </div>
        )}
      />
    </Section>
  );
}
