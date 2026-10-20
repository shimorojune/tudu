import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';

export interface SegmentedItem<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string = string> {
  /** Two to four items, one or two words each. */
  items: SegmentedItem<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  className?: string;
}

/**
 * Switch between sibling views (Day | 2 days, To do | Crossed off). The paper-coloured thumb slides to the
 * chosen item over dur-panel-in; labels keep one weight so nothing reflows. Arrow keys move the choice.
 */
export function Segmented<T extends string = string>({
  items,
  value,
  defaultValue,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  const [val, setVal] = useControllable<T | undefined>(value, defaultValue ?? items[0]?.value);
  const box = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  const measure = () => {
    const el = box.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!el) return;
    setThumb((t) => {
      const n = { x: el.offsetLeft, w: el.offsetWidth };
      return t && t.x === n.x && t.w === n.w ? t : n;
    });
  };
  useLayoutEffect(measure, [val]);
  useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const pick = (v: T) => {
    setVal(v);
    onChange?.(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((it) => it.value === val);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const item = items[next]!;
    pick(item.value);
    box.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  };

  return (
    <div
      ref={box}
      className={cx('tp-root tp-seg', thumb && 'tp-ready', className)}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      <span
        className="tp-seg-thumb"
        aria-hidden="true"
        style={thumb ? { width: thumb.w, transform: `translateX(${thumb.x}px)` } : undefined}
      />
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={val === it.value ? 'true' : 'false'}
          tabIndex={val === it.value ? 0 : -1}
          onClick={() => pick(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
