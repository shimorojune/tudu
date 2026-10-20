import { useEffect } from 'react';
import { connectEvents } from '@tudu/client';
import { API_URL } from './config';
import { queryClient } from './session';

/** While signed in, keep the live stream open; any event refreshes what the page shows. */
export function useLiveEvents(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handle = connectEvents({
      url: `${API_URL}/api/events`,
      onEvent: (e) => {
        if (e.type !== 'hello') void queryClient.invalidateQueries();
      },
    });
    return () => handle.close();
  }, [enabled]);
}
