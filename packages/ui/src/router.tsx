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
