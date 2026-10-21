import { SPACE_COLORS } from '@tudu/core';
import type { CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { TICK_PATH } from '../lib/ink';

export interface ColorPickProps {
  value?: string;
  defaultValue?: string;
  onChange?: (color: string) => void;
  /** The swatches, the design's eight muted ones by default. */
  colors?: readonly string[];
  label?: string;
  className?: string;
}

/** A space's colour: a row of eight muted swatches (no brand red). The picked one gets an ink ring and a white tick. */
export function ColorPick({
  value,
  defaultValue,
  onChange,
  colors = SPACE_COLORS,
  label = 'Colour',
  className,
}: ColorPickProps) {
  const [val, setVal] = useControllable<string | undefined>(value, defaultValue ?? colors[0]);
  return (
    <div className={cx('tp-root tp-cpick', className)} role="radiogroup" aria-label={label}>
      {colors.map((c) => {
        const on = val === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on ? 'true' : 'false'}
            aria-label={c}
            className={cx('tp-cpick-o', on && 'tp-on')}
            style={{ '--sw': c } as CSSProperties}
            onClick={() => {
              setVal(c);
              onChange?.(c);
            }}
          >
            {on ? (
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={TICK_PATH} />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
