import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ToastHost } from '@tudu/ui';
import { AppShell } from './app/AppShell';
import { useLiveEvents } from './app/live';
import { meQuery, queryClient } from './app/session';
import { KitPage } from './routes/kit/KitPage';
import { SignInPage } from './routes/sign-in/SignInPage';
import { SoonPage, TodayPage } from './routes/today/TodayPage';

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
    if (me) throw redirect({ to: search.next ?? '/', replace: true });
  },
  component: SignInPage,
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
        search: { next: location.pathname === '/' ? undefined : location.pathname },
        replace: true,
      });
    return { me };
  },
  component: function AppLayout() {
    const { me } = appRoute.useRouteContext();
    useLiveEvents(true);
    return (
      <AppShell me={me}>
        <Outlet />
      </AppShell>
    );
  },
});

const todayRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: TodayPage });
const weekRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/week',
  component: () => (
    <SoonPage title="The week is on its way." body="Seven day tiles and the Backlog arrive with chunk 05." />
  ),
});
const backlogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/backlog',
  component: () => (
    <SoonPage title="The Backlog is on its way." body="Tasks without a day arrive with chunk 06." />
  ),
});
const inboxRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inbox',
  component: () => (
    <SoonPage title="The Inbox is on its way." body="What people send you arrives with chunk 08." />
  ),
});
const kitRoute = createRoute({ getParentRoute: () => rootRoute, path: '/kit', component: KitPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    signInRoute,
    appRoute.addChildren([todayRoute, weekRoute, backlogRoute, inboxRoute]),
    kitRoute,
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
