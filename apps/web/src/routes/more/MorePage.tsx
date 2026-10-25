import { useNavigate } from '@tanstack/react-router';
import type { SpaceSummary } from '@tudu/core';
import { Icon, Sheet, SheetBody, type IconName } from '@tudu/ui';
import { openFeedback } from '../../app/feedback';
import { useJira } from '../../app/jira';
import { useAllScope } from '../../app/allSpaces';
import { pagePath, useSpace, type View } from '../../app/space';

export interface MoreItem {
  value: View;
  label: string;
  icon: IconName;
  hint: string;
}

/**
 * What More keeps on phones: the Backlog, People in a team space, Apps and Settings (the Inbox is in the header).
 * All spaces has no People or Apps of its own.
 */
export function moreItems(space: Pick<SpaceSummary, 'kind' | 'name'>, jira = false, all = false): MoreItem[] {
  const items: MoreItem[] = [
    {
      value: 'backlog',
      label: 'Backlog',
      icon: 'backlog',
      hint: all ? 'Tasks without a day, in every space' : 'Tasks without a day',
    },
  ];
  if (all) {
    items.push({
      value: 'settings',
      label: 'Settings',
      icon: 'settings',
      hint: 'You, your spaces, how Tudu looks',
    });
    return items;
  }
  if (space.kind === 'team')
    items.push({ value: 'people', label: 'People', icon: 'team', hint: `Everyone in ${space.name}` });
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
  const all = !!useAllScope();
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
            {moreItems(space, !!conn, all).map((it) => (
              <button
                key={it.value}
                type="button"
                className="app-more-item"
                onClick={() => void navigate({ href: pagePath(space.slug, all, it.value) })}
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
            <button type="button" className="app-more-item" onClick={openFeedback}>
              <span className="app-more-icon" aria-hidden="true">
                <Icon name="comment" size={18} />
              </span>
              <span className="app-more-words">
                <span className="app-more-label">Send feedback</span>
                <span className="app-more-hint">Something wrong, or an idea</span>
              </span>
            </button>
          </nav>
        </SheetBody>
      </Sheet>
    </div>
  );
}
