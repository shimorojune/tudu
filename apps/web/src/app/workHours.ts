import type { MeResponse } from '@tudu/client';
import type { WorkHours } from '@tudu/core';
import type { SettingsHours } from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { api, queryClient } from './session';
import { useOnline } from './tasks';

/**
 * Settings › Working hours: your hours from your account, saved as you change them. The change shows at once (and
 * nudges follow it); when the server can't take it, the line says so and the same hours go again once back online.
 */
export function useWorkHours(me: MeResponse): SettingsHours {
  const online = useOnline();
  const [saveError, setSaveError] = useState(false);
  const waiting = useRef<WorkHours | null>(null);
  const save = (hours: WorkHours) => {
    const cur = queryClient.getQueryData<MeResponse | null>(['me']);
    if (cur) queryClient.setQueryData<MeResponse>(['me'], { ...cur, workHours: hours });
    waiting.current = hours;
    void api.post('/api/me/hours', hours).then(
      () => {
        if (waiting.current === hours) waiting.current = null;
        setSaveError(false);
      },
      () => setSaveError(true),
    );
  };
  useEffect(() => {
    if (online && saveError && waiting.current) save(waiting.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
  return { hours: me.workHours ?? null, saveError, onChange: save };
}
