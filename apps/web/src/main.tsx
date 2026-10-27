import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { queryClient } from './app/session';
import { desktop } from './app/desktop';
import { dismissBoot } from './app/boot';
import { installDropGuard } from './app/dropGuard';
import './styles.css';

// In the macOS app the page knows it at once, so the desk's chrome (room for the traffic lights) never jumps.
const app = desktop();
if (app) document.documentElement.dataset.app = app.window === 'main' ? 'desktop' : app.window;

// A file dropped where nothing takes it does nothing (no leaving Tudu for the file).
installDropGuard();

// The launch mark goes once the first page (the app, Sign in, or an error) has drawn.
const stopBoot = router.subscribe('onRendered', () => {
  stopBoot();
  requestAnimationFrame(() => dismissBoot());
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
