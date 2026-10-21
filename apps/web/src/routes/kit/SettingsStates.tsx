import { deleteAsk } from '@tudu/core';
import { ConfirmDialog, ProjectSettings, Settings } from '@tudu/ui';
import { Pair, Section } from './Pair';

const ME = { name: 'Rohit Raj', email: 'rohit@northwind.io', initials: 'RR' };
const NW = { name: 'Northwind', color: '#3d5a80', members: 19, role: 'admin' as const };
const noop = () => {};

/** Settings as a phone shows it, Appearance, the Projects block and Delete's ask, light and dark. */
export function SettingsStates() {
  const ask = deleteAsk('Northwind', 19);
  return (
    <Section
      id="settings"
      title="Settings"
      lead="You, the space and how Tudu looks. Fields save as you leave them; there is no Save button."
    >
      <Pair
        title="The list"
        note="On phones the list is the page: your mark, then You and the space. On the desk the same list sits on the left of a large dialog."
        render={() => (
          <Settings layout="phone" view="list" me={ME} space={NW} theme="system" still onSection={noop} />
        )}
      />
      <Pair
        title="Appearance"
        note="Light, Dark or System as cards; Less motion turns day turns and slides into simple fades."
        render={() => (
          <Settings
            layout="phone"
            view="section"
            section="appearance"
            me={ME}
            space={NW}
            theme="system"
            still
          />
        )}
      />
      <Pair
        title="Projects"
        note="In Settings › Space: each project's dot opens the swatches, the name saves when you leave it, Delete has Undo."
        render={() => (
          <ProjectSettings
            projects={[
              { id: 'p1', name: 'Launch', color: '#3d5a80', open: 3 },
              { id: 'p2', name: 'Hiring', color: '#5a7a4e', open: 0 },
            ]}
          />
        )}
      />
      <Pair
        title="Asking first"
        note="Delete asks you to type the space's name; the ink button wakes when it matches. Nothing is red."
        render={() => (
          <ConfirmDialog
            open
            inline
            onClose={noop}
            onConfirm={noop}
            title={ask.title}
            confirmLabel={ask.confirm}
            typeToConfirm="Northwind"
            typed="North"
          >
            {ask.body}
          </ConfirmDialog>
        )}
      />
    </Section>
  );
}
