// ci filter test
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { router } from './router';
import { queryClient } from './app/session';
import { desktop } from './app/desktop';
import './styles.css';

// In the macOS app the page knows it at once, so the desk's chrome (room for the traffic lights) never jumps.
const app = desktop();
if (app) document.documentElement.dataset.app = app.window === 'main' ? 'desktop' : app.window;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
