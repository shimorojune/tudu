import { prefersReducedMotion } from './hooks';

/**
 * Row motion from the Tudu Paper design system: a new row opens its gap (its height eases from nothing to its own,
 * then the words fade in), a row that leaves folds its gap closed, and a dropped row gets a soft wash. Measured
 * and driven frame by frame so the motion is even all the way; reduced motion skips straight to the end.
 */

/** A cubic-bezier curve as a function of x, like CSS's. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const a = (p1: number, p2: number) => 1 - 3 * p2 + 3 * p1;
  const b = (p1: number, p2: number) => 3 * p2 - 6 * p1;
  const c = (p1: number) => 3 * p1;
  const at = (t: number, p1: number, p2: number) => ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t;
  const slope = (t: number, p1: number, p2: number) => 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    return at(t, y1, y2);
  };
}

/** ease-arrive */
export const easeArrive = bezier(0.2, 0.7, 0.2, 1);

/** The box that scrolls a list: the sheet body or the page's scroll column. */
export function scrollerOf(el: Element): HTMLElement | null {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'hidden') && n.scrollHeight > n.clientHeight + 1)
      return n;
    if (n.classList.contains('tp-sheet-body') || n.classList.contains('tp-scroll')) return n;
  }
  return null;
}

/**
 * Open a new row's gap: height 0 to its own over dur-row-open (ease-arrive), the words fading in over the last part.
 * With `follow`, the scroller glides along in step so the row (or, for 'add', the writing line under it) lands in
 * view. Returns a function that finishes at once.
 */
export function openRow(el: HTMLElement, follow?: 'add' | 'out' | null): () => void {
  const full = el.getBoundingClientRect().height;
  const sc = follow ? scrollerOf(el) : null;
  let need = 0;
  let start = 0;
  if (sc) {
    const list = el.closest('.tp-list');
    const anchor = follow === 'add' ? (list?.parentElement?.querySelector(':scope > .tp-addtask') ?? el) : el;
    const sr = sc.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    start = sc.scrollTop;
    need = Math.max(0, ar.bottom + 20 - sr.bottom);
  }
  if (prefersReducedMotion() || !full) {
    if (sc && need) sc.scrollTop = start + need;
    return () => {};
  }
  const dur = parseFloat(getComputedStyle(el).getPropertyValue('--dur-row-open')) || 360;
  // a longer glide takes a little longer, never more than twice the row
  const sdur = Math.min(dur * 2, dur + need * 0.5);
  let t0 = 0;
  let raf = 0;
  let done = false;
  el.style.height = '0px';
  el.style.overflow = 'hidden';
  el.style.opacity = '0';
  const clear = () => {
    el.style.height = '';
    el.style.overflow = '';
    el.style.opacity = '';
  };
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur);
    const q = Math.min(1, (now - t0) / sdur);
    if (p < 1) {
      el.style.height = `${full * easeArrive(p)}px`;
      el.style.opacity = String(p < 0.3 ? 0 : easeArrive((p - 0.3) / 0.7));
    } else if (el.style.height) clear();
    if (sc && need) sc.scrollTop = start + need * easeArrive(q);
    if (q < 1 || p < 1) raf = requestAnimationFrame(frame);
    else done = true;
  };
  raf = requestAnimationFrame(frame);
  return () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clear();
    if (sc && need) sc.scrollTop = start + need;
  };
}

/** A row that leaves the list folds its gap closed (240ms) instead of vanishing, then `done` runs. */
export function closeRow(el: HTMLElement | null, done: () => void): void {
  if (!el || prefersReducedMotion()) {
    done();
    return;
  }
  const full = el.getBoundingClientRect().height;
  const dur = 240;
  let t0 = 0;
  el.style.overflow = 'hidden';
  el.style.pointerEvents = 'none';
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const q = Math.min(1, (now - t0) / dur);
    el.style.height = `${full * (1 - easeArrive(q))}px`;
    el.style.opacity = String(Math.max(0, 1 - q * 1.8));
    if (q < 1) requestAnimationFrame(frame);
    else done();
  };
  requestAnimationFrame(frame);
}

const dropTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** After a drop, the moved row's soft selection wash fades off it (the same wash a new task gets). */
export function dropFlash(el: HTMLElement): void {
  el.classList.remove('tp-dropped');
  void el.offsetWidth;
  el.classList.add('tp-dropped');
  clearTimeout(dropTimers.get(el));
  dropTimers.set(
    el,
    setTimeout(() => el.classList.remove('tp-dropped'), 1300),
  );
}

/** Glide a row from where it was (`fromTop`) to where it is now, then wash it. */
export function settleFrom(el: HTMLElement, fromTop: number): void {
  dropFlash(el);
  const dy = fromTop - el.getBoundingClientRect().top;
  if (Math.abs(dy) < 1) return;
  el.classList.add('tp-settling');
  el.style.transition = 'none';
  el.style.transform = `translateY(${dy}px)`;
  void el.offsetWidth;
  el.style.transition = '';
  el.style.transform = '';
  setTimeout(() => el.classList.remove('tp-settling'), 320);
}
