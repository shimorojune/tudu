import { MenuBarSheet, type MenuBarGroupItem } from '@tudu/ui';
import { useState } from 'react';
import { Pair, Section } from './Pair';

const HEADING = { eyebrow: 'Today · Week 43', day: 'Friday', date: '23 October' };
const PERSONAL: MenuBarGroupItem = {
  key: 'me',
  name: 'Personal',
  space: { name: 'Personal', personal: true },
  rows: [
    { key: 'a', title: 'Book the dentist for the kids', carried: { label: 'Wed' } },
    { key: 'b', title: 'Pay the electricity bill', done: true },
    { key: 'c', title: 'Renew the passport', due: { label: 'Thu', overdue: true } },
  ],
};
const NORTHWIND: MenuBarGroupItem = {
  key: 'nw',
  name: 'Northwind',
  space: { name: 'Northwind', initials: 'N', color: '#2f6f5e' },
  rows: [
    {
      key: 'd',
      title: 'Review the launch brief',
      project: { name: 'Launch', color: '#c2410c' },
      jira: 'NW-212',
    },
    { key: 'e', title: 'Send the Q4 numbers to Meera', done: true },
  ],
};

/** A day whose ticks work in the kit, as they do under the tick. */
function Day({ groups, offline }: { groups: MenuBarGroupItem[]; offline?: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const live = groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, done: done[r.key] ?? r.done })),
  }));
  return (
    <MenuBarSheet
      state="day"
      heading={HEADING}
      groups={live}
      offline={offline}
      onToggle={(r, v) => setDone((d) => ({ ...d, [r.key]: v }))}
    />
  );
}

/** Today from the menu bar: one space, two spaces, offline, nothing today and signed out, light and dark. */
export function MenuBarStates() {
  return (
    <Section
      id="menu-bar"
      title="Today from the menu bar"
      lead="What a click on the tick opens on the Mac: today across your spaces, ticked off right there, with New task, Open Tudu and ⋯ (Send feedback…, Quit)."
    >
      <Pair title="Menu bar, one space" render={() => <Day groups={[PERSONAL]} />} />
      <Pair title="Menu bar, two spaces" render={() => <Day groups={[PERSONAL, NORTHWIND]} />} />
      <Pair title="Menu bar, offline" render={() => <Day groups={[PERSONAL]} offline />} />
      <Pair
        title="Menu bar, nothing today"
        render={() => (
          <MenuBarSheet
            state="empty"
            heading={HEADING}
            emptyLines={['Tomorrow has 3.', 'The Backlog has 12 waiting for a day.']}
          />
        )}
      />
      <Pair title="Menu bar, signed out" render={() => <MenuBarSheet state="signed-out" />} />
    </Section>
  );
}
