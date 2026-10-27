/**
 * Opening Tudu: the launch mark (`#boot` in index.html) gives way to the app once its first page is ready. It only
 * ever showed after 300ms, so a quicker start just drops it; a slower one fades it out (the mark swells as it goes)
 * while the app comes up under it.
 */

/** How long the mark waits before it shows, as in launch.css. */
export const BOOT_DELAY_MS = 300;
/** The leaving fade is 180ms; this is the backstop should its animationend never come. */
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
  boot.classList.add('tl-leaving');
  app?.classList.add('tl-arrive');
  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    boot.remove();
    app?.classList.remove('tl-arrive');
  };
  boot.addEventListener('animationend', (e) => {
    if (e.target === boot) done();
  });
  setTimeout(done, BOOT_LEAVE_MS);
}

/** Tests only: allow another dismissal. */
export function resetBoot(): void {
  dismissed = false;
}
