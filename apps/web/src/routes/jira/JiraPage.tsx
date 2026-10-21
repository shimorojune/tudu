import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AppsList, JiraView } from '../../app/JiraHost';
import { hostOf, setFromApps, useJira, withJira } from '../../app/jira';
import { spacePath, useSpace } from '../../app/space';
import { useViewport } from '../../app/viewport';
import './jira.css';

/**
 * Jira on phones: a page of its own behind the Jira tab, the preview as a sheet (`?issue=KEY`). Before Jira is
 * connected it is the connect form, reached from More › Apps with ‹ Apps back.
 */
export function JiraPage() {
  const vp = useViewport();
  const navigate = useNavigate();
  const space = useSpace();
  const loc = useRouterState({ select: (s) => s.location });
  const issue = new URLSearchParams(loc.searchStr).get('issue');
  // The desk and tablets keep Jira beside the page: the address turns into Today with ?jira.
  useEffect(() => {
    if (vp !== 'phone')
      void navigate({
        href: withJira(
          { pathname: spacePath(space.slug), searchStr: '' },
          issue ? issue.toUpperCase() : null,
        ),
        replace: true,
      });
  }, [vp, issue, space.slug, navigate]);
  if (vp !== 'phone') return null;
  const at = (key: string | null) =>
    void navigate({
      href: `${spacePath(space.slug, 'jira')}${key ? `?issue=${encodeURIComponent(key)}` : ''}`,
      replace: !!key === !!issue,
    });
  return (
    <div className="app-page app-jira">
      <JiraView space={space} issue={issue ? issue.toUpperCase() : null} onIssue={at} compact />
    </div>
  );
}

/** Apps on phones: a page under More. Connect pushes the Jira form in, with ‹ Apps back. */
export function AppsPage() {
  const vp = useViewport();
  const navigate = useNavigate();
  const space = useSpace();
  const { conn } = useJira(space.id);
  useEffect(() => {
    if (vp !== 'phone') void navigate({ href: spacePath(space.slug), replace: true });
  }, [vp, space.slug, navigate]);
  if (vp !== 'phone') return null;
  return (
    <div className="app-page app-apps">
      <AppsList
        space={space}
        compact
        connected={conn ? { who: conn.who.email || conn.who.name, site: hostOf(conn)! } : null}
        onJira={() => {
          setFromApps(!conn);
          void navigate({ href: spacePath(space.slug, 'jira') });
        }}
      />
    </div>
  );
}
