import type { MeResponse } from '@tudu/client';
import { localTimeOf, pauseUntil, type NudgeEvery } from '@tudu/core';
import type { NudgePermission, SettingsNudges } from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import { desktop, type DesktopBridge } from './desktop';
import {
  CLOCK_CHECK_MS,
  exampleWords,
  hoursOfMe,
  nextWords,
  nudgeNow,
  nudgePrefs,
  pausedWords,
  readLast,
  tickNudges,
  useNudgePrefs,
} from './nudges';

/** Pause for today, from Settings or from a nudge's own button: until your next working day's start. */
function pauseToday(me: MeResponse): void {
  nudgePrefs.set({ pausedUntil: pauseUntil(hoursOfMe(me), localTimeOf(nudgeNow())) });
}

/**
 * The nudge clock, in the desk's window (it keeps running while the window is hidden): every 30 seconds, and when
 * the window comes back, it looks whether a nudge is due and sends it. A nudge's Pause for today lands here.
 */
export function NudgeClock({ d, me }: { d: DesktopBridge; me: MeResponse }) {
  const latest = useRef(me);
  useEffect(() => {
    latest.current = me;
  });
  useEffect(() => {
    const look = () => void tickNudges({ d, me: latest.current, at: nudgeNow() });
    look();
    const t = setInterval(look, CLOCK_CHECK_MS);
    const vis = () => {
      if (document.visibilityState === 'visible') look();
    };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', look);
    const stop = d.on('nudges:pause', () => pauseToday(latest.current));
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', look);
      stop();
    };
  }, [d]);
  return null;
}

/**
 * Settings › Working hours › Nudges, in the Mac app (undefined on the web). Turning it on asks macOS; an ad hoc
 * signed Tudu is refused with no box, so the section shows the way to System Settings and looks again each time Tudu
 * comes back to the front: once allowed, it sends one test nudge so you see it work.
 */
export function useNudgeSettings(me: MeResponse): SettingsNudges | undefined {
  const d = desktop();
  const p = useNudgePrefs();
  const [permission, setPermission] = useState<NudgePermission>('unknown');
  const [test, setTest] = useState<SettingsNudges['test']>('idle');
  const [, tick] = useState(0);
  const wasOff = useRef(false);
  const latest = useRef(me);
  useEffect(() => {
    latest.current = me;
  });

  const sendTest = (bridge: DesktopBridge) => {
    setTest('sending');
    void tickNudges({ d: bridge, me: latest.current, at: nudgeNow(), test: true }).then((r) =>
      setTest(r === 'sent' ? 'sent' : 'failed'),
    );
  };

  useEffect(() => {
    if (!d) return;
    let live = true;
    const look = () =>
      void d.notifyStatus().then((s) => {
        if (!live) return;
        setPermission(s);
        // Allowed in System Settings while Tudu was away: one test nudge, so you see it work.
        if (s === 'allowed' && wasOff.current && nudgePrefs.get().on) sendTest(d);
        wasOff.current = s === 'denied';
        tick((n) => n + 1);
      });
    look();
    const vis = () => {
      if (document.visibilityState === 'visible') look();
    };
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', vis);
    // "Next at" moves on with the clock.
    const t = setInterval(() => tick((n) => n + 1), CLOCK_CHECK_MS);
    return () => {
      live = false;
      window.removeEventListener('focus', look);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(t);
    };
  }, [d]);

  if (!d) return undefined;
  const hours = hoursOfMe(me);
  const now = localTimeOf(nudgeNow());
  return {
    on: p.on,
    every: p.every,
    permission,
    next: nextWords(p, hours, now, readLast(me.user.id)),
    paused: pausedWords(p, now),
    test,
    example: exampleWords(hours, p.every, now.day),
    onSwitch: (on) => {
      nudgePrefs.set({ on });
      setTest('idle');
      if (!on) return;
      setPermission('asking');
      void d.notifyPermission().then((s) => {
        setPermission(s);
        wasOff.current = s === 'denied';
      });
    },
    onEvery: (every: NudgeEvery) => nudgePrefs.set({ every }),
    onPause: () => pauseToday(me),
    onResume: () => nudgePrefs.set({ pausedUntil: null }),
    onTest: () => sendTest(d),
    onOpenSettings: () => d.openNotificationSettings(),
  };
}
