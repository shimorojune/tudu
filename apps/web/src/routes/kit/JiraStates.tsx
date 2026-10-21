import { AppsPanel, JiraPanel, JiraPreview, type JiraPanelIssue, type JiraPanelProps } from '@tudu/ui';
import { Pair, Section } from './Pair';

const SUN = '2026-10-18';
const ISSUES: JiraPanelIssue[] = [
  {
    key: 'TUDU-212',
    summary: 'Make the Jira panel remember the last view',
    status: 'In progress',
    due: '2026-10-22',
  },
  { key: 'TUDU-219', summary: 'Fix the date picker on Safari', status: 'To do', due: '2026-10-16' },
  {
    key: 'TUDU-220',
    summary: 'Run the request status enum migration on production',
    status: 'In review',
    linked: [{ taskId: 't1', id: 'ME-52', title: 'Run the migration', day: SUN, done: false }],
  },
  { key: 'OPS-14', summary: 'Rotate the staging database password', status: 'To do', due: '2026-10-20' },
];
const VIEWS = [
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'v1', label: 'My open bugs', jql: 'issuetype = Bug AND resolution = Unresolved', saved: true },
];

/** One state of the panel at its desk height. */
function Board(props: Partial<JiraPanelProps>) {
  return (
    <div className="kit-jp">
      <JiraPanel
        today={SUN}
        issues={ISSUES}
        views={VIEWS}
        view="assigned"
        site="jira.northwind.io"
        synced="12 min ago"
        onClose={() => {}}
        onDisconnect={() => {}}
        {...props}
      />
    </div>
  );
}

/** The Jira panel in its states, the preview, the connect form and Apps, light and dark. */
export function JiraStates() {
  return (
    <Section
      id="jira"
      title="Jira"
      lead="Your Jira issues beside the day. Add one to a day and it becomes a linked task; the day stays live under the panel."
    >
      <Pair
        title="Issues"
        note="One plain list in Jira's order: key, status, due. A linked issue ends with its task."
        render={() => <Board />}
      />
      <Pair
        title="Connect"
        note="The address and a personal access token; Jira's no lands under its field."
        render={() => <Board state="connect" />}
      />
      <Pair
        title="Token refused"
        render={() => (
          <Board
            state="connect"
            initial={{
              connect: {
                site: 'https://jira.northwind.io',
                token: 'pat-old',
                error: {
                  field: 'token',
                  message: 'Jira didn’t accept this token. Check it, or make a new one.',
                },
              },
            }}
          />
        )}
      />
      <Pair title="Loading" render={() => <Board state="loading" issues={[]} />} />
      <Pair
        title="Adding"
        note="The calendar button spins in its slot; nothing in the row moves."
        render={() => <Board initial={{ adding: { 'TUDU-212': 'busy' } }} />}
      />
      <Pair
        title="A JQL Jira couldn't run"
        render={() => (
          <Board
            view="custom"
            jql="stauts = Done"
            initial={{
              jqlOpen: true,
              jqlError: "Field 'stauts' does not exist or you do not have permission to view it.",
            }}
          />
        )}
      />
      <Pair
        title="Saving a view"
        render={() => (
          <Board view="custom" jql="issuetype = Bug" initial={{ jqlOpen: true, saveName: 'My open bugs' }} />
        )}
      />
      <Pair title="Nothing found" render={() => <Board view="custom" jql="project = NONE" issues={[]} />} />
      <Pair title="Couldn't reach Jira" render={() => <Board state="error" issues={[]} />} />
      <Pair
        title="Couldn't refresh"
        note="The last issues stay, faded, under a calm banner."
        render={() => <Board state="error" />}
      />
      <Pair title="Token expired" render={() => <Board state="expired" />} />
      <Pair title="Offline" render={() => <Board state="offline" />} />
      <Pair
        title="The preview"
        render={() => (
          <div className="kit-jp">
            <JiraPreview
              today={SUN}
              issue={{
                key: 'TUDU-212',
                summary: 'Make the Jira panel remember the last view',
                status: 'In progress',
                due: '2026-10-22',
                issuetype: 'Story',
                assignee: { name: 'Asha Rao', initials: 'AR' },
                priority: 'High',
                updated: 'Sun 08:40',
                description:
                  '<p>When you close the panel and open it again, it should come back on the view you left.</p>',
                comments: [
                  {
                    key: 'c1',
                    who: 'Meera Iyer',
                    initials: 'MI',
                    when: 'Thu',
                    html: '<p>Is this per space or per browser?</p>',
                  },
                  { key: 'c2', who: 'Asha Rao', initials: 'AR', when: 'Fri', html: '<p>Both, I think.</p>' },
                ],
              }}
              onOpenInJira={() => {}}
            />
          </div>
        )}
      />
      <Pair
        title="Apps"
        note="Tudu starts with none; an app shows in the sidebar, the top bar and the tabs once it is connected."
        render={() => (
          <div className="kit-jp">
            <AppsPanel
              apps={[
                {
                  id: 'jira',
                  name: 'Jira',
                  blurb: 'Your Jira issues beside your day. Add one to a day and it becomes a linked task.',
                },
              ]}
            />
          </div>
        )}
      />
    </Section>
  );
}
