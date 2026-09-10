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
import { SettingsRoute } from "@/routes/SettingsRoute";
import { UnscheduledRoute } from "@/routes/UnscheduledRoute";

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
  component: TodayRoute,
});

const weekRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/week",
  validateSearch: (search: Record<string, unknown>) => ({
    week: typeof search.week === "string" ? search.week : undefined,
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

const reportDayRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/team/$userId",
  validateSearch: (search: Record<string, unknown>) => ({
    send: search.send === true || search.send === "1" || search.send === "true",
  }),
  component: ReportDayRoute,
});

const unscheduledRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/unscheduled",
  component: UnscheduledRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/settings",
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([signInRoute, signUpRoute]),
  appLayoutRoute.addChildren([
    todayRoute,
    weekRoute,
    inboxRoute,
    unscheduledRoute,
    teamRoute,
    reportDayRoute,
    settingsRoute,
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
