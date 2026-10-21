import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { PERSONAL_SLUG, type SpaceSummary, type TaskRefResponse } from '@tudu/core';
import { ToastHost } from '@tudu/ui';
import { AppShell } from './app/AppShell';
import { useLiveEvents } from './app/live';
import { WorkingDayProvider } from './app/workingDay';
import { api, meQuery, queryClient } from './app/session';
import {
  homePath,
  lastSpace,
  rememberSpace,
  spaceBySlug,
  spacePath,
  SpaceProvider,
  type View,
} from './app/space';
import { KitPage } from './routes/kit/KitPage';
import { BacklogPage } from './routes/backlog/BacklogPage';
import { InboxPage } from './routes/inbox/InboxPage';
import { JoinPage } from './routes/join/JoinPage';
import { MorePage } from './routes/more/MorePage';
import { PeoplePage } from './routes/people/PeoplePage';
import { QuickAddPage } from './routes/quick-add/QuickAddPage';
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
    </>
  ),
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === 'string' ? { next: s.next } : {},
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (me) throw redirect({ href: search.next ?? homePath(me.spaces), replace: true });
  },
  component: SignInPage,
});

/** An invite's link: Join Northwind, with sign in under it when you are not in yet. */
const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  beforeLoad: async ({ context }) => ({ me: await context.queryClient.fetchQuery(meQuery) }),
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
    const me = await context.queryClient.fetchQuery(meQuery);
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

const taskSearch = (s: Record<string, unknown>): { task?: string } =>
  typeof s.task === 'string' && s.task ? { task: s.task } : {};

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

/** A space: every view lives under its part of the address (`me` for Personal). */
const spaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$space',
  beforeLoad: ({ context, params }) => {
    const space = spaceBySlug(context.me.spaces, params.space);
    if (!space) throw redirect({ href: homePath(context.me.spaces), replace: true });
    rememberSpace(space.slug);
    return { space };
  },
  component: function SpaceLayout() {
    const ctx = spaceRoute.useRouteContext();
    // The route context is read once per navigation; the counts on the sidebar and the switcher (the Inbox, the
    // members) follow the me query instead, so a change that arrives live shows without a navigation.
    const { data: liveMe } = useQuery({ ...meQuery, initialData: ctx.me });
    const me = liveMe ?? ctx.me;
    const space = spaceBySlug(me.spaces, ctx.space.slug) ?? ctx.space;
    useLiveEvents(true);
    return (
      <WorkingDayProvider>
        <SpaceProvider space={space}>
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
/** The floating bar alone: the page the macOS window opens on the global summon (chunk 11). */
const quickAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/quick-add',
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (!me) throw redirect({ to: '/sign-in', search: { next: '/quick-add' }, replace: true });
    return { me };
  },
  component: function QuickAddRoute() {
    const { me } = quickAddRoute.useRouteContext();
    useLiveEvents(true);
    return (
      <WorkingDayProvider>
        <QuickAddPage me={me} />
      </WorkingDayProvider>
    );
  },
});

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
        inboxRoute,
        inboxItemRoute,
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
