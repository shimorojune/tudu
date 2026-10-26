import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  ALL_SLUG,
  hasAllSpaces,
  PERSONAL_SLUG,
  spaceForSlug,
  switcherOrder,
  type SpaceSummary,
  type TaskRefResponse,
} from '@tudu/core';
import type { MeResponse } from '@tudu/client';
import { ToastHost } from '@tudu/ui';
import { AppShell } from './app/AppShell';
import { DesktopHost } from './app/DesktopHost';
import { useLiveEvents } from './app/live';
import { leftHere, onSpaceGone, SettingsPage } from './app/settings';
import { setSpaceGoneHandler, taskStore } from './app/tasks';
import { WorkingDayProvider } from './app/workingDay';
import { api, loadMe, meQuery, queryClient, refreshMe } from './app/session';
import { AllProvider, filterOf, targetOf, type AllScope } from './app/allSpaces';
import {
  ALL_VIEWS,
  allPath,
  homePath,
  lastSpace,
  rememberSpace,
  spacePath,
  SpaceProvider,
  withSlug,
  oldInboxPath,
  spaceBySlug,
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
import { MenuBarPage } from './routes/menubar/MenuBarPage';
import { NotebookPage } from './routes/notebook/NotebookPage';
import { NoteWindowPage } from './routes/notebook/NoteWindowPage';
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
      if (slug === ALL_SLUG)
        throw redirect({
          href: (ALL_VIEWS.includes(view) ? allPath(view) : spacePath(PERSONAL_SLUG, view)) + q,
          replace: true,
        });
      throw redirect({ href: spacePath(slug, view) + q, replace: true });
    },
  });
}
const legacyRoutes = [
  legacy('/week', 'week'),
  legacy('/backlog', 'backlog'),
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
    const last = lastSpace(context.me.spaces);
    const slug = hit?.slug ?? (last === ALL_SLUG ? null : last) ?? PERSONAL_SLUG;
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
  component: function SpaceRoute() {
    const ctx = spaceRoute.useRouteContext();
    return <SpaceLayout me={ctx.me} space={ctx.space} follow />;
  },
});

/**
 * The shell around a page: the space's sidebar, the top bar, live events. The route context is read once per
 * navigation; the counts on the sidebar and the switcher (the Inbox, the members) follow the me query instead, so a
 * change that arrives live shows without a navigation. `follow` keeps the address on a renamed space's new slug
 * (not for the Inbox, whose address has no space in it).
 */
function SpaceLayout({
  me: ctxMe,
  space: ctxSpace,
  follow,
}: {
  me: MeResponse;
  space: SpaceSummary;
  follow?: boolean;
}) {
  const navigate = useNavigate();
  const { data: liveMe } = useQuery({ ...meQuery, initialData: ctxMe });
  const me = liveMe ?? ctxMe;
  const live = me.spaces.find((s) => s.id === ctxSpace.id);
  const space = live ?? ctxSpace;
  useLiveEvents(true);

  useEffect(() => {
    setSpaceGoneHandler((e) => onSpaceGone(e, space, (href) => void navigate({ href, replace: true })));
    return () => setSpaceGoneHandler(null);
  }, [space, navigate]);
  return (
    <WorkingDayProvider>
      <SpaceProvider space={space}>
        {follow ? <SlugFollow space={live} was={ctxSpace.slug} /> : null}
        <AppShell me={me} space={space}>
          <Outlet />
        </AppShell>
      </SpaceProvider>
    </WorkingDayProvider>
  );
}

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
/** The Inbox's address may name the view and a space: /inbox?view=sent&space=northwind. */
const inboxSearch = (
  s: Record<string, unknown>,
): { task?: string; view?: 'inbox' | 'answered' | 'sent'; space?: string } => ({
  ...taskSearch(s),
  ...(s.view === 'answered' || s.view === 'sent' || s.view === 'inbox' ? { view: s.view } : {}),
  ...(typeof s.space === 'string' && s.space ? { space: s.space } : {}),
});

/**
 * One Inbox across every space, at /inbox. Its address has no space in it, so the shell around it is the last
 * space you were in (Personal the first time); nothing in the sidebar is lit.
 */
const inboxLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inbox',
  beforeLoad: ({ context }) => {
    const me = context.me;
    const slug = lastSpace(me.spaces) ?? PERSONAL_SLUG;
    const space =
      spaceBySlug(me.spaces, slug) ?? me.spaces.find((s) => s.kind === 'personal') ?? me.spaces[0]!;
    return { space, me };
  },
  component: function InboxLayout() {
    const ctx = inboxLayoutRoute.useRouteContext();
    return <SpaceLayout me={ctx.me} space={ctx.space} />;
  },
});
const inboxRoute = createRoute({
  getParentRoute: () => inboxLayoutRoute,
  path: '/',
  validateSearch: inboxSearch,
  component: InboxPage,
});
const inboxItemRoute = createRoute({
  getParentRoute: () => inboxLayoutRoute,
  path: '/$itemId',
  validateSearch: inboxSearch,
  component: InboxPage,
});
/**
 * Your Notebook, at /notebook (a note at /notebook/<id>, Trash at /notebook/trash). It is yours, not a space's, so
 * the shell around it is the last space you were in, as for the Inbox.
 */
const notebookLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/notebook',
  beforeLoad: ({ context }) => {
    const me = context.me;
    const slug = lastSpace(me.spaces) ?? PERSONAL_SLUG;
    const space =
      spaceBySlug(me.spaces, slug) ?? me.spaces.find((s) => s.kind === 'personal') ?? me.spaces[0]!;
    return { space, me };
  },
  component: function NotebookLayout() {
    const ctx = notebookLayoutRoute.useRouteContext();
    return <SpaceLayout me={ctx.me} space={ctx.space} />;
  },
});
const notebookRoute = createRoute({
  getParentRoute: () => notebookLayoutRoute,
  path: '/',
  validateSearch: taskSearch,
  component: NotebookPage,
});
const notebookTrashRoute = createRoute({
  getParentRoute: () => notebookLayoutRoute,
  path: '/trash',
  validateSearch: taskSearch,
  component: NotebookPage,
});
const notebookNoteRoute = createRoute({
  getParentRoute: () => notebookLayoutRoute,
  path: '/$noteId',
  validateSearch: taskSearch,
  component: NotebookPage,
});
/** Before the one Inbox, each space had its own: /northwind/inbox lands on the Inbox narrowed to Northwind. */
const oldInbox = ({
  context,
  params,
  search,
}: {
  context: { space: SpaceSummary };
  params: { itemId?: string };
  search: { view?: string };
}) => {
  throw redirect({ href: oldInboxPath(context.space, params.itemId, search.view), replace: true });
};
const oldInboxRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/inbox',
  validateSearch: inboxSearch,
  beforeLoad: oldInbox,
});
const oldInboxItemRoute = createRoute({
  getParentRoute: () => spaceRoute,
  path: '/inbox/$itemId',
  validateSearch: inboxSearch,
  beforeLoad: oldInbox,
});
/** All spaces' address may name a space it is narrowed to: /all?space=northwind. */
const allSearch = (s: Record<string, unknown>): { task?: string; space?: string } => ({
  ...taskSearch(s),
  ...(typeof s.space === 'string' && s.space ? { space: s.space } : {}),
});

/**
 * All spaces, at /all: your own tasks from every space, in one list. A static path, so it wins over a space's
 * `/$space` (the slug `all` is reserved for this). With fewer than two spaces there is nothing to gather: Personal.
 */
const allRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/all',
  beforeLoad: ({ context }) => {
    if (!hasAllSpaces(context.me.spaces)) throw redirect({ href: spacePath(PERSONAL_SLUG), replace: true });
    rememberSpace(ALL_SLUG);
    return { me: context.me };
  },
  component: function AllRoute() {
    const ctx = allRoute.useRouteContext();
    return <AllLayout me={ctx.me} />;
  },
});

/**
 * The shell around All spaces: the shell of the space a task written here goes to (Personal, or the filtered
 * space), with All spaces' own sidebar. A space you stop being in while you look leaves the page, with a banner.
 */
function AllLayout({ me: ctxMe }: { me: MeResponse }) {
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const { data: liveMe } = useQuery({ ...meQuery, initialData: ctxMe });
  const me = liveMe ?? ctxMe;
  const spaces = switcherOrder(me.spaces);
  const slug = new URLSearchParams(loc.searchStr).get('space') ?? undefined;
  const filter = filterOf(spaces, slug);
  const target = targetOf(spaces, filter);
  const [gone, setGone] = useState<{ name: string } | null>(null);
  useLiveEvents(true);

  // Back to one space: nothing to gather any more, so Personal.
  const few = !hasAllSpaces(me.spaces);
  useEffect(() => {
    if (few) void navigate({ href: spacePath(PERSONAL_SLUG), replace: true });
  }, [few, navigate]);
  // A slug you are not in (a stale link, a space you left): the filter and its chip go.
  useEffect(() => {
    if (slug && !filter) {
      const q = new URLSearchParams(loc.searchStr);
      q.delete('space');
      const qs = q.toString();
      void navigate({ href: loc.pathname + (qs ? `?${qs}` : ''), replace: true });
    }
  }, [slug, filter, loc.pathname, loc.searchStr, navigate]);
  useEffect(() => {
    setSpaceGoneHandler((e) => {
      taskStore.forgetSpace(e.spaceId);
      // Left from Settings here: Settings says so itself.
      if (!leftHere(e.spaceId)) setGone({ name: e.name });
    });
    return () => setSpaceGoneHandler(null);
  }, []);

  const scope: AllScope = {
    spaces,
    filter,
    target,
    setFilter: (id) => {
      const next = id ? spaces.find((s) => s.id === id) : null;
      const q = new URLSearchParams(loc.searchStr);
      if (next) q.set('space', next.slug);
      else q.delete('space');
      const qs = q.toString();
      void navigate({ href: loc.pathname + (qs ? `?${qs}` : ''), replace: true });
    },
    gone,
    dismissGone: () => setGone(null),
  };
  if (few) return null;
  return (
    <WorkingDayProvider>
      <SpaceProvider space={target}>
        <AllProvider value={scope}>
          <AppShell me={me} space={target} all>
            <Outlet />
          </AppShell>
        </AllProvider>
      </SpaceProvider>
    </WorkingDayProvider>
  );
}

const allTodayRoute = createRoute({
  getParentRoute: () => allRoute,
  path: '/',
  validateSearch: allSearch,
  component: TodayPage,
});
const allWeekRoute = createRoute({
  getParentRoute: () => allRoute,
  path: '/week',
  validateSearch: allSearch,
  component: WeekPage,
});
const allBacklogRoute = createRoute({
  getParentRoute: () => allRoute,
  path: '/backlog',
  validateSearch: allSearch,
  component: BacklogPage,
});

const allMoreRoute = createRoute({ getParentRoute: () => allRoute, path: '/more', component: MorePage });

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

/**
 * Today from the menu bar: the page the macOS app's sheet holds (a click on the tick shows it). In the app it says
 * Sign in in place, and Open Tudu takes you to the desk to do it.
 */
const menuBarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/menubar',
  beforeLoad: async ({ context }) => {
    const me = await loadMe(context.queryClient);
    if (!me && !desktop()) throw redirect({ to: '/sign-in', search: { next: '/menubar' }, replace: true });
    return { me };
  },
  component: function MenuBarRoute() {
    const { me } = menuBarRoute.useRouteContext();
    return <MenuBarPage me={me} />;
  },
});

/**
 * The note window alone: the page the macOS app's note window holds, and the browser's popup (↗ on a note). In the
 * app it never turns into Sign in; the desk does that.
 */
const noteWindowSearch = (s: Record<string, unknown>) => s;
async function noteWindowLoad({
  context,
  location,
}: {
  context: RouterContext;
  location: { pathname: string };
}) {
  const me = await loadMe(context.queryClient);
  if (!me && !desktop())
    throw redirect({ to: '/sign-in', search: { next: location.pathname }, replace: true });
  return { me };
}
const noteWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/note-window',
  validateSearch: noteWindowSearch,
  beforeLoad: noteWindowLoad,
  component: function NoteWindowRoute() {
    return <NoteWindowPage />;
  },
});
const noteWindowNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/note-window/$noteId',
  validateSearch: noteWindowSearch,
  beforeLoad: noteWindowLoad,
  component: function NoteWindowNoteRoute() {
    const { noteId } = noteWindowNoteRoute.useParams();
    return <NoteWindowPage noteId={noteId} />;
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
      inboxLayoutRoute.addChildren([inboxRoute, inboxItemRoute]),
      notebookLayoutRoute.addChildren([notebookRoute, notebookTrashRoute, notebookNoteRoute]),
      allRoute.addChildren([allTodayRoute, allWeekRoute, allBacklogRoute, allMoreRoute]),
      spaceRoute.addChildren([
        todayRoute,
        weekRoute,
        backlogRoute,
        peopleRoute,
        personRoute,
        moreRoute,
        jiraRoute,
        appsRoute,
        oldInboxRoute,
        oldInboxItemRoute,
        settingsRoute,
        settingsSectionRoute,
      ]),
    ]),
    kitRoute,
    quickAddRoute,
    menuBarRoute,
    noteWindowRoute,
    noteWindowNoteRoute,
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
