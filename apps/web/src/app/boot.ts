/**
 * Opening Tudu: the launch mark (`#boot` in index.html) gives way to the app once its first page is ready. It only
 * ever showed after 300ms, so a quicker start just drops it; a slower one fades it out (the mark swells as it goes)
 * while the app comes up under it. While it does, the page can't scroll: the app rises 4px into place, and those 4px
 * would otherwise bring up a scrollbar for a moment that pushes the mark and the app sideways (#48).
 */

/** How long the mark waits before it shows, as in launch.css. */
export const BOOT_DELAY_MS = 300;
/** The leaving fade is 180ms and the app's arrival 220ms; this is the backstop should their animationend never come. */
export const BOOT_LEAVE_MS = 400;

/** Whether the mark is on screen: carried on from the Mac app's loader, or the page has been loading 300ms. */
export function bootShown(held: boolean, sincePageStart: number): boolean {
  return held || sincePageStart >= BOOT_DELAY_MS;
}

let dismissed = false;

/** Let the mark go: at once if it never showed, else with its leaving fade. Only the first call does anything. */
export function dismissBoot(doc: Document = document, sincePageStart: number = performance.now()): void {
  if (dismissed) return;
  const boot = doc.getElementById('boot');
  if (!boot) return;
  dismissed = true;
  const root = doc.documentElement;
  if (!bootShown(root.dataset.boot === 'held', sincePageStart)) {
    boot.remove();
    return;
  }
  const app = doc.getElementById('root');
  // A page that already scrolls keeps its scrollbar; one that doesn't is held still until the app is at rest.
  const settle = root.scrollHeight <= root.clientHeight;
  if (settle) root.classList.add('tl-settle');
  boot.classList.add('tl-leaving');
  app?.classList.add('tl-arrive');
  // Done once both have ended: the mark's fade and the app's arrival (the later one, 220ms, lets the page scroll again).
  const waiting = new Set<Element>(app ? [boot, app] : [boot]);
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    boot.remove();
    app?.classList.remove('tl-arrive');
    if (settle) root.classList.remove('tl-settle');
  };
  const ended = (e: Event) => {
    if (!waiting.delete(e.target as Element)) return;
    if (waiting.size === 0) done();
  };
  boot.addEventListener('animationend', ended);
  app?.addEventListener('animationend', ended);
  setTimeout(done, BOOT_LEAVE_MS);
}

/** Tests only: allow another dismissal. */
export function resetBoot(): void {
  dismissed = false;
}
