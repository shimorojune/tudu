import { currentThemeChoice, onLessMotion, onThemeChange, readLessMotion } from '@tudu/ui';
import type { DesktopBridge } from './desktop';

/**
 * The Mac app keeps Settings › Appearance and Less motion for its windows, so its next launch opens in them from the
 * first frame (and the window's own controls match). Sent now, since the app may be new or the choice made on the web
 * since, and again on every change. Returns the way to stop.
 */
export function keepAppearance(d: Pick<DesktopBridge, 'setAppearance'>): () => void {
  const send = () => d.setAppearance({ theme: currentThemeChoice(), lessMotion: readLessMotion() });
  send();
  const stopTheme = onThemeChange(send);
  const stopMotion = onLessMotion(send);
  return () => {
    stopTheme();
    stopMotion();
  };
}
