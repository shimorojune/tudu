import { useNavigate } from '@tanstack/react-router';
import { inboxCountWords, type SpaceSummary } from '@tudu/core';
import { Icon, Sheet, SheetBody, type IconName } from '@tudu/ui';
import { useJira } from '../../app/jira';
import { spacePath, useSpace, type View } from '../../app/space';

export interface MoreItem {
  value: View;
  label: string;
  icon: IconName;
  hint: string;
}

/** What More keeps on phones: the Backlog, People in a team space, the Inbox, Apps and Settings. */
export function moreItems(
  space: Pick<SpaceSummary, 'kind' | 'name'> & { inbox?: SpaceSummary['inbox'] },
  jira = false,
): MoreItem[] {
  const items: MoreItem[] = [
    { value: 'backlog', label: 'Backlog', icon: 'backlog', hint: 'Tasks without a day' },
  ];
  if (space.kind === 'team')
    items.push({ value: 'people', label: 'People', icon: 'team', hint: `Everyone in ${space.name}` });
  const n = space.inbox ? space.inbox.toAnswer + space.inbox.unread : 0;
  items.push({
    value: 'inbox',
    label: 'Inbox',
    icon: 'inbox',
    hint: n ? inboxCountWords(space.inbox!) : 'All caught up',
  });
  items.push({ value: 'apps', label: 'Apps', icon: 'plug', hint: jira ? 'Jira' : 'None yet' });
  items.push({
    value: 'settings',
    label: 'Settings',
    icon: 'settings',
    hint: 'You, this space, how Tudu looks',
  });
  return items;
}

/** The phone's More page: a short list of the views that have no tab of their own. */
export function MorePage() {
  const navigate = useNavigate();
  const space = useSpace();
  const { conn } = useJira(space.id);
  return (
    <div className="app-page app-more">
      <Sheet label="More" fill minHeight={320}>
        <div className="tp-root tp-dh tp-compact app-more-head">
          <div className="tp-dh-row">
            <div className="tp-dh-day">
              <div className="tp-day">
                <h1>More</h1>
              </div>
            </div>
          </div>
        </div>
        <SheetBody>
          <nav className="app-more-list" aria-label="More">
            {moreItems(space, !!conn).map((it) => (
              <button
                key={it.value}
                type="button"
                className="app-more-item"
                onClick={() => void navigate({ href: spacePath(space.slug, it.value) })}
              >
                <span className="app-more-icon" aria-hidden="true">
                  <Icon name={it.icon} size={18} />
                </span>
                <span className="app-more-words">
                  <span className="app-more-label">{it.label}</span>
                  <span className="app-more-hint">{it.hint}</span>
                </span>
                <span className="app-more-go" aria-hidden="true">
                  <Icon name="right" size={16} />
                </span>
              </button>
            ))}
          </nav>
        </SheetBody>
      </Sheet>
    </div>
  );
}
