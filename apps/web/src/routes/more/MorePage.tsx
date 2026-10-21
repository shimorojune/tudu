import { useNavigate } from '@tanstack/react-router';
import { Icon, Sheet, SheetBody, type IconName } from '@tudu/ui';

/** What More keeps on phones: the Backlog now; Inbox, Settings, spaces and apps join it with their chunks. */
export const MORE_ITEMS: Array<{ value: string; label: string; icon: IconName; path: string; hint: string }> =
  [{ value: 'backlog', label: 'Backlog', icon: 'backlog', path: '/backlog', hint: 'Tasks without a day' }];

/** The phone's More page: a short list of the views that have no tab of their own. */
export function MorePage() {
  const navigate = useNavigate();
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
            {MORE_ITEMS.map((it) => (
              <button
                key={it.value}
                type="button"
                className="app-more-item"
                onClick={() => void navigate({ to: it.path })}
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
