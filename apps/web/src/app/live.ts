import { useEffect } from 'react';
import { connectEvents } from '@tudu/client';
import { TASKS_CHANGED } from '@tudu/core';
import { API_URL } from './config';
import { queryClient } from './session';
import { taskStore } from './tasks';

/**
 * While signed in, keep the live stream open. A change to tasks refreshes just the days it names; anything else
 * refreshes what the page shows. Coming back after the stream dropped reads every cached day again.
 */
export function useLiveEvents(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let dropped = false;
    const handle = connectEvents({
      url: `${API_URL}/api/events`,
      onEvent: (e) => {
        if (e.type === 'hello') return;
        if (e.type === TASKS_CHANGED) taskStore.onEvent(e);
        else void queryClient.invalidateQueries();
      },
      onStatus: (s) => {
        if (s === 'closed') dropped = true;
        if (s === 'open' && dropped) {
          dropped = false;
          taskStore.refreshAll();
        }
      },
    });
    return () => handle.close();
  }, [enabled]);
}
