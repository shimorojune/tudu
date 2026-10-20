import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { ToastHost } from '@tudu/ui';
import { KitPage } from './routes/kit/KitPage';
import { HomePage } from './routes/HomePage';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <ToastHost />
    </>
  ),
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const kitRoute = createRoute({ getParentRoute: () => rootRoute, path: '/kit', component: KitPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, kitRoute]),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
