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
import { InboxRoute } from "@/routes/InboxRoute";
import { TeamRoute } from "@/routes/TeamRoute";
import { ReportDayRoute } from "@/routes/ReportDayRoute";
import { ReportWeekRoute } from "@/routes/ReportWeekRoute";
import { ReportInboxRoute } from "@/routes/ReportInboxRoute";
import { SettingsRoute } from "@/routes/SettingsRoute";
import { UnscheduledRoute } from "@/routes/UnscheduledRoute";
import { ProjectRoute } from "@/routes/ProjectRoute";
import { parseProjectSearch } from "@/lib/projectFilter";

const rootRoute = createRootRoute({
  component: () => <Outlet />,
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

const todayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => parseProjectSearch(search),
  component: TodayRoute,
});

const weekRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/week",
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
    ...parseProjectSearch(search),
  }),
  component: WeekRoute,
});

const inboxRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/inbox",
  component: InboxRoute,
});

const teamRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/team",
  component: TeamRoute,
});

const reportWeekRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/team/$userId/week",
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
    ...parseProjectSearch(search),
  }),
  component: ReportWeekRoute,
});

const reportInboxRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/team/$userId/inbox",
  validateSearch: (search: Record<string, unknown>) => ({
    send: search.send === true || search.send === "1" || search.send === "true",
  }),
  component: ReportInboxRoute,
});

const reportDayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/team/$userId",
  validateSearch: (search: Record<string, unknown>) => ({
    send: search.send === true || search.send === "1" || search.send === "true",
    ...parseProjectSearch(search),
  }),
  component: ReportDayRoute,
});

const unscheduledRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/unscheduled",
  validateSearch: (search: Record<string, unknown>) => parseProjectSearch(search),
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
  component: ProjectRoute,
});

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([signInRoute, signUpRoute]),
  appLayoutRoute.addChildren([
    todayRoute,
    weekRoute,
    inboxRoute,
    unscheduledRoute,
    teamRoute,
    reportWeekRoute,
    reportInboxRoute,
    reportDayRoute,
    settingsRoute,
    projectRoute,
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
