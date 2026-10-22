import type { QueryClient } from '@tanstack/react-query';
import type { GettingStartedStep } from '@tudu/core';
import type { MeResponse } from './auth';

/**
 * Tick one of Getting started's rows in the cached `/api/me` answer, so the card ticks the moment you do the thing.
 * The server reads the same from its rows, so the next load agrees.
 */
export function tickGettingStarted(qc: QueryClient, step: GettingStartedStep): void {
  const me = qc.getQueryData<MeResponse | null>(['me']);
  const gs = me?.gettingStarted;
  if (!me || !gs || gs.done[step]) return;
  qc.setQueryData<MeResponse>(['me'], {
    ...me,
    gettingStarted: { ...gs, done: { ...gs.done, [step]: true } },
  });
}
