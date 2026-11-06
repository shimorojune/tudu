import { useEffect } from 'react';
import { connectEvents } from '@tudu/client';
import {
  INBOX_CHANGED,
  ME_CHANGED,
  MEMBERS_CHANGED,
  NOTEBOOK_CHANGED,
  PROJECTS_CHANGED,
  SPACE_CHANGED,
  SPACE_GONE,
  TASKS_CHANGED,
} from '@tudu/core';
import { API_URL } from './config';
import { queryClient } from './session';
import { notebookStore } from './notebook';
import { taskStore } from './tasks';

/**
 * While signed in, keep the live stream open. A change to tasks refreshes just the days it names; anything else
 * refreshes what the page shows. Coming back after the stream dropped reads every cached day again.
 */
export function useLiveEvents(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let dropped = false;
    // A new stream starts "now": anything that happened after this page read who you are and before the stream
    // opened (a request sent to you as the page loads) never comes down it. Reading `me` once more on the first
    // hello closes that gap (the server is listening for you by the time it arrives); the Inbox count and the Dock
    // badge come from it.
    let first = true;
    const handle = connectEvents({
      url: `${API_URL}/api/events`,
      onEvent: (e) => {
        if (e.type === 'hello') {
          if (first) void queryClient.invalidateQueries({ queryKey: ['me'] });
          first = false;
          return;
        }
        // Your Notebook: only what another window or device changed reads again.
        if (e.type === NOTEBOOK_CHANGED) return notebookStore.onEvent(e);
        // Your own account (your hours) changed elsewhere: only who you are reads again.
        if (e.type === ME_CHANGED) return void queryClient.invalidateQueries({ queryKey: ['me'] });
        if (
          [
            TASKS_CHANGED,
            PROJECTS_CHANGED,
            MEMBERS_CHANGED,
            INBOX_CHANGED,
            SPACE_CHANGED,
            SPACE_GONE,
          ].includes(e.type)
        )
          taskStore.onEvent(e);
        else void queryClient.invalidateQueries();
      },
      onStatus: (s) => {
        if (s === 'closed') dropped = true;
        if (s === 'open' && dropped) {
          dropped = false;
          taskStore.refreshAll();
          notebookStore.refreshAll();
        }
      },
    });
    return () => handle.close();
  }, [enabled]);
}
