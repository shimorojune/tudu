import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { PERSONAL_SLUG, spaceForSlug, type SpaceSummary, type TaskRefResponse } from '@tudu/core';
import type { MeResponse } from '@tudu/client';
import { ToastHost } from '@tudu/ui';
import { AppShell } from './app/AppShell';
import { DesktopHost } from './app/DesktopHost';
import { useLiveEvents } from './app/live';
import { onSpaceGone, SettingsPage } from './app/settings';
import { setSpaceGoneHandler } from './app/tasks';
import { WorkingDayProvider } from './app/workingDay';
import { api, loadMe, meQuery, queryClient, refreshMe } from './app/session';
import {
  homePath,
  lastSpace,
  rememberSpace,
  spacePath,
  SpaceProvider,
  withSlug,
  type View,
} from './app/space';
import { KitPage } from './routes/kit/KitPage';
import { BacklogPage } from './routes/backlog/BacklogPage';
import { InboxPage } from './routes/inbox/InboxPage';
import { JoinPage } from './routes/join/JoinPage';
import { MorePage } from './routes/more/MorePage';
import { AppsPage, JiraPage } from './routes/jira/JiraPage';
import { PeoplePage } from './routes/people/PeoplePage';
import { FloatingQuickAdd, QuickAddPage } from './routes/quick-add/QuickAddPage';
import { desktop } from './app/desktop';
import { SignInPage } from './routes/sign-in/SignInPage';
import { TodayPage } from './routes/today/TodayPage';
import { WeekPage } from './routes/week/WeekPage';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <ToastHost />
      <DesktopHost />
    </>
  ),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === 'string' ? { next: s.next } : {},
  beforeLoad: async ({ context, search }) => {
    const me = await loadMe(context.queryClient);
    if (me) throw redirect({ href: search.next ?? homePath(me.spaces), replace: true });
  },
  component: SignInPage,
});

/** An invite's link: Join Northwind, with sign in under it when you are not in yet. */
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  beforeLoad: async ({ context }) => ({ me: await loadMe(context.queryClient) }),
  component: function JoinRoute() {
    const { me } = joinRoute.useRouteContext();
    return <JoinPage me={me} />;
  },
});

/** Every page of the app: needs a session, else back to sign in with the way back remembered. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const me = await loadMe(context.queryClient);
    if (!me)
      throw redirect({
        to: '/sign-in',
        search: { next: location.pathname === '/' ? undefined : location.pathname + location.searchStr },
        replace: true,
      });
    return { me };
  },
});

/** `/` opens the last space you were in, Personal the first time. */
const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: ({ context, location }) => {
    // The search travels along, so /?task=ME-1 still opens the task in the last space.
    throw redirect({ href: homePath(context.me.spaces) + location.searchStr, replace: true });
  },
});

/**
 * Every page takes ?task= (the task panel), ?settings= (Settings over the page on the desk and tablets) and ?jira
 * (the Jira panel beside the page; ?jira=KEY with an issue open).
 */
const taskSearch = (s: Record<string, unknown>): { task?: string; settings?: string; jira?: string } => ({
  ...(typeof s.task === 'string' && s.task ? { task: s.task } : {}),
  ...(typeof s.settings === 'string' && s.settings ? { settings: s.settings } : {}),
  ...(typeof s.jira === 'string' ? { jira: s.jira } : {}),
});

/** The old addresses, from before the space was in them: the same view in the last space. */
function legacy(path: string, view: View) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    validateSearch: taskSearch,
    beforeLoad: ({ context, search }) => {
      const slug = lastSpace(context.me.spaces) ?? PERSONAL_SLUG;
      const q = search.task ? `?task=${encodeURIComponent(search.task)}` : '';
      throw redirect({ href: spacePath(slug, view) + q, replace: true });
    },
  });
}
const legacyRoutes = [
  legacy('/week', 'week'),
  legacy('/backlog', 'backlog'),
  legacy('/inbox', 'inbox'),
  legacy('/people', 'people'),
  legacy('/more', 'more'),
];

/** A link to a task: /t/NW-12 opens it on its day in its space, or in that space's Backlog when it has none. */
const taskLinkRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/t/$ref',
  beforeLoad: async ({ params, context }) => {
    const hit = await api
      .get<TaskRefResponse>(`/api/tasks/ref/${encodeURIComponent(params.ref)}`)
      .catch(() => null);
    const slug = hit?.slug ?? lastSpace(context.me.spaces) ?? PERSONAL_SLUG;
    const view: View = hit && hit.day === null ? 'backlog' : 'today';
    throw redirect({
      href: `${spacePath(slug, view)}?task=${encodeURIComponent(params.ref)}`,
      replace: true,
    });
  },
});

/**
 * Renamed (here or by another admin): the address follows, while it still shows this space's old slug. A navigation
 * to another space passes through here with the new address and is left alone. Its own component, so only it
 * re-renders as the address changes, never the shell around the page.
 */
function SlugFollow({ space, was }: { space: SpaceSummary | undefined; was: string }) {
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const at = loc.pathname.split('/')[1];
  useEffect(() => {
    if (space && space.slug !== was && at === was) {
      rememberSpace(space.slug);
      void navigate({ href: withSlug(loc.pathname, space.slug) + loc.searchStr, replace: true });
    }
  }, [space, at, was, loc.pathname, loc.searchStr, navigate]);
  return null;
}

/** A space: every view lives under its part of the address (`me` for Personal). */
const spaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$space',
  beforeLoad: async ({ context, params, location }) => {
    let me = context.me;
    let hit = spaceForSlug(me.spaces, params.space);
    // Not in the spaces this tab knows: maybe you joined (or were put back) a moment ago. Ask the server once.
    if (!hit) {
      me = (await refreshMe()) ?? me;
      hit = spaceForSlug(me.spaces, params.space);
    }
    if (!hit) throw redirect({ href: homePath(me.spaces), replace: true });
    // A space renamed since the link was made: its old address lands on the new one.
    if (hit.moved)
      throw redirect({
        href: withSlug(location.pathname, hit.space.slug) + location.searchStr,
        replace: true,
      });
    rememberSpace(hit.space.slug);
    return { space: hit.space, me };
  },
  component: function SpaceLayout() {
    const ctx = spaceRoute.useRouteContext();
    const navigate = useNavigate();
    // The route context is read once per navigation; the counts on the sidebar and the switcher (the Inbox, the
    // members) follow the me query instead, so a change that arrives live shows without a navigation.
    const { data: liveMe } = useQuery({ ...meQuery, initialData: ctx.me });
    const me = liveMe ?? ctx.me;
    const live = me.spaces.find((s) => s.id === ctx.space.id);
    const space = live ?? ctx.space;
    useLiveEvents(true);

    useEffect(() => {
      setSpaceGoneHandler((e) => onSpaceGone(e, space, (href) => void navigate({ href, replace: true })));
      return () => setSpaceGoneHandler(null);
    }, [space, navigate]);
    return (
      <WorkingDayProvider>
        <SpaceProvider space={space}>
          <SlugFollow space={live} was={ctx.space.slug} />
          <AppShell me={me} space={space}>
            <Outlet />
          </AppShell>
        </SpaceProvider>
      </WorkingDayProvider>
    );
  },
});

const todayRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/',
  validateSearch: taskSearch,
  component: TodayPage,
});
const weekRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/week',
  validateSearch: taskSearch,
  component: WeekPage,
});
const backlogRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/backlog',
  validateSearch: taskSearch,
  component: BacklogPage,
});
/** People, team spaces only: Personal sends you to its Today. */
const peopleRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/people',
  validateSearch: taskSearch,
  beforeLoad: ({ context }) => {
    if (context.space.kind !== 'team') throw redirect({ href: spacePath(context.space.slug), replace: true });
  },
  component: PeoplePage,
});
const personRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/people/$userId',
  validateSearch: taskSearch,
  beforeLoad: ({ context }) => {
    if (context.space.kind !== 'team') throw redirect({ href: spacePath(context.space.slug), replace: true });
  },
  component: PeoplePage,
});
/** Settings on phones: the list, and a section pushed in. The desk and tablets turn these into ?settings=. */
const settingsRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/settings',
  component: function SettingsRoute() {
    const { me } = settingsRoute.useRouteContext();
    const { data } = useQuery({ ...meQuery, initialData: me });
    return <SettingsPage me={data ?? me} />;
  },
});
const settingsSectionRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/settings/$section',
  component: function SettingsSectionRoute() {
    const { me } = settingsSectionRoute.useRouteContext();
    const { section } = settingsSectionRoute.useParams();
    const { data } = useQuery({ ...meQuery, initialData: me });
    return <SettingsPage me={data ?? me} section={section} />;
  },
});
/** Jira on phones (the tab once connected, and the connect form under More › Apps), and Apps under More. */
const jiraRoute = createRoute({ getParentRoute: () => spaceRoute, path: '/jira', component: JiraPage });
const appsRoute = createRoute({ getParentRoute: () => spaceRoute, path: '/apps', component: AppsPage });
/** The phone's More tab: the views with no tab of their own. */
const moreRoute = createRoute({ getParentRoute: () => spaceRoute, path: '/more', component: MorePage });
/** The Inbox's address may name the view: /northwind/inbox?view=sent. */
const inboxSearch = (
  s: Record<string, unknown>,
): { task?: string; view?: 'inbox' | 'answered' | 'sent' } => ({
  ...taskSearch(s),
  ...(s.view === 'answered' || s.view === 'sent' || s.view === 'inbox' ? { view: s.view } : {}),
});
/** Personal has no Inbox (nobody sends you tasks there): its address goes back to Today, like People. */
const teamOnly = ({ context }: { context: { space: SpaceSummary } }) => {
  if (context.space.kind !== 'team') throw redirect({ href: spacePath(context.space.slug), replace: true });
};
const inboxRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/inbox',
  validateSearch: inboxSearch,
  beforeLoad: teamOnly,
  component: InboxPage,
});
const inboxItemRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/inbox/$itemId',
  validateSearch: inboxSearch,
  beforeLoad: teamOnly,
  component: InboxPage,
});
const kitRoute = createRoute({ getParentRoute: () => rootRoute, path: '/kit', component: KitPage });
/**
 * The floating bar alone: the page the macOS app's floating window holds (the summon shows it). In the app it never
 * turns into Sign in; the desk does that.
 */
const quickAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quick-add',
  beforeLoad: async ({ context }) => {
    const me = await loadMe(context.queryClient);
    if (!me && !desktop()) throw redirect({ to: '/sign-in', search: { next: '/quick-add' }, replace: true });
    return { me };
  },
  component: function QuickAddRoute() {
    const { me } = quickAddRoute.useRouteContext();
    if (desktop()) return <FloatingQuickAdd me={me} />;
    return <WebQuickAdd me={me!} />;
  },
});

function WebQuickAdd({ me }: { me: MeResponse }) {
  useLiveEvents(true);
  return (
    <WorkingDayProvider>
      <QuickAddPage me={me} />
    </WorkingDayProvider>
  );
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    signInRoute,
    joinRoute,
    appRoute.addChildren([
      homeRoute,
      ...legacyRoutes,
      taskLinkRoute,
      spaceRoute.addChildren([
        todayRoute,
        weekRoute,
        backlogRoute,
        peopleRoute,
        personRoute,
        moreRoute,
        jiraRoute,
        appsRoute,
        inboxRoute,
        inboxItemRoute,
        settingsRoute,
        settingsSectionRoute,
      ]),
    ]),
    kitRoute,
    quickAddRoute,
  ]),
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
