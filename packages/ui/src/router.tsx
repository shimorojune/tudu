import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { AppShell } from "@/routes/AppShell";
import { AuthLayout } from "@/routes/AuthLayout";
import { SignInRoute } from "@/routes/SignInRoute";
import { SignUpRoute } from "@/routes/SignUpRoute";
import { TodayRoute } from "@/routes/TodayRoute";
import { WeekRoute } from "@/routes/WeekRoute";
import { SettingsRoute } from "@/routes/SettingsRoute";
import { UnscheduledRoute } from "@/routes/UnscheduledRoute";
import { ProjectRoute } from "@/routes/ProjectRoute";
import { RequestsRoute } from "@/routes/RequestsRoute";
import { CoworkersRoute } from "@/routes/CoworkersRoute";
import { CoworkerDayRoute } from "@/routes/CoworkerDayRoute";
import { OrgAdminRoute } from "@/routes/OrgAdminRoute";
import { InviteAcceptRoute } from "@/routes/InviteAcceptRoute";
import { JoinRoute } from "@/routes/JoinRoute";
import { WelcomeRoute } from "@/routes/WelcomeRoute";
import {
  DATE_ONLY_FIELDS,
  DAY_TASK_TAB_FIELDS,
  parseDaySearch,
  TASK_TAB_FIELDS,
} from "@/lib/daySearch";
import { parseProjectSearch } from "@/lib/projectFilter";
import { AnalyticsPageView } from "@/providers/AnalyticsPageView";
import { useDesktopDeepLinks } from "@/hooks/useDesktopDeepLinks";

function RootOutlet() {
  useDesktopDeepLinks();
  return (
    <>
      <AnalyticsPageView />
      <Outlet />
    </>
  );
}

const rootRoute = createRootRoute({
  component: RootOutlet,
});

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "auth",
  component: AuthLayout,
});

const signInRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/sign-in",
  component: SignInRoute,
});

const signUpRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: "/sign-up",
  component: SignUpRoute,
});

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
});

const welcomeRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/welcome",
  validateSearch: (search: Record<string, unknown>) => ({
    orgSlug: typeof search.orgSlug === "string" ? search.orgSlug : undefined,
  }),
  component: WelcomeRoute,
});

const todayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseProjectSearch(search),
    ...parseDaySearch(search, DAY_TASK_TAB_FIELDS),
  }),
  component: TodayRoute,
});

const weekRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/week",
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
    ...parseProjectSearch(search),
    ...parseDaySearch(search, DATE_ONLY_FIELDS),
  }),
  component: WeekRoute,
});

const requestsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/requests",
  component: RequestsRoute,
});

const unscheduledRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/unscheduled",
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseProjectSearch(search),
    ...parseDaySearch(search, TASK_TAB_FIELDS),
  }),
  component: UnscheduledRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsRoute,
});

const projectRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/projects/$projectId",
  validateSearch: (search: Record<string, unknown>) =>
    parseDaySearch(search, TASK_TAB_FIELDS),
  component: ProjectRoute,
});

const orgTodayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug",
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseProjectSearch(search),
    ...parseDaySearch(search, DAY_TASK_TAB_FIELDS),
  }),
  component: TodayRoute,
});

const orgWeekRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/week",
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
    ...parseProjectSearch(search),
    ...parseDaySearch(search, DATE_ONLY_FIELDS),
  }),
  component: WeekRoute,
});

const orgRequestsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/requests",
  component: RequestsRoute,
});

const orgUnscheduledRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/unscheduled",
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseProjectSearch(search),
    ...parseDaySearch(search, TASK_TAB_FIELDS),
  }),
  component: UnscheduledRoute,
});

const orgCoworkersRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/coworkers",
  component: CoworkersRoute,
});

const orgCoworkerDayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/coworkers/$userId",
  component: CoworkerDayRoute,
});

const orgAdminRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/o/$orgSlug/admin",
  component: OrgAdminRoute,
});

const inviteAcceptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: InviteAcceptRoute,
});

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join/$code",
  component: JoinRoute,
});

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([signInRoute, signUpRoute]),
  inviteAcceptRoute,
  joinRoute,
  appLayoutRoute.addChildren([
    welcomeRoute,
    todayRoute,
    weekRoute,
    requestsRoute,
    unscheduledRoute,
    settingsRoute,
    projectRoute,
    orgTodayRoute,
    orgWeekRoute,
    orgRequestsRoute,
    orgUnscheduledRoute,
    orgCoworkersRoute,
    orgCoworkerDayRoute,
    orgAdminRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <Navigate to="/sign-in" />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
