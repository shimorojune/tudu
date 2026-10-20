import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** A value that is controlled when the prop is given, otherwise kept locally. */
export function useControllable<T>(controlled: T | undefined, initial: T): [T, (next: T) => void] {
  const [own, setOwn] = useState(initial);
  const value = controlled !== undefined ? controlled : own;
  return [value, setOwn];
}

/** Call `close` on a pointer-down outside `ref` while `open`. */
export function useOutside(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    function away(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, ref, close]);
}

/** True when the person asked the system for less motion. Updates live. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * When `key` changes, ease the element's width from its old size to its new one instead of jumping
 * (buttons whose label changes, chips whose text changes). Adds `tp-sizing` while moving.
 */
export function useWidthEase(ref: RefObject<HTMLElement | null>, key: unknown): void {
  const last = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = el.style.width ? el.getBoundingClientRect().width : last.current;
    el.style.transition = 'none';
    el.style.width = '';
    const to = el.getBoundingClientRect().width;
    last.current = to;
    el.style.transition = '';
    if (!from || Math.abs(from - to) < 0.5 || prefersReducedMotion()) return;
    el.classList.add('tp-sizing');
    el.style.width = `${from}px`;
    void el.offsetWidth;
    el.style.width = `${to}px`;
    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'width') {
        el.style.width = '';
        el.classList.remove('tp-sizing');
        el.removeEventListener('transitionend', done);
      }
    };
    el.addEventListener('transitionend', done);
    return () => el.removeEventListener('transitionend', done);
  }, [key, ref]);
}

/** A stable id for a field: the explicit one, else a generated one with a readable prefix. */
export function useFieldId(explicit: string | undefined, label: string | undefined, prefix = 'tp-f'): string {
  const auto = useId();
  if (explicit) return explicit;
  const slug = (label || 'field').replace(/\W+/g, '-').toLowerCase();
  return `${prefix}-${slug}-${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** A timer that is cleared on unmount. */
export function useTimer(): (fn: () => void, ms: number) => void {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (t.current) clearTimeout(t.current);
    },
    [],
  );
  return useCallback((fn: () => void, ms: number) => {
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(fn, ms);
  }, []);
}
