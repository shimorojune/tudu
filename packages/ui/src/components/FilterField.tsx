import { useRef } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface FilterFieldProps {
  value?: string;
  defaultValue?: string;
  onChange?: (text: string) => void;
  /** "Search" by default. */
  placeholder?: string;
  /** The accessible name; the placeholder when left out. */
  label?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * A small pill search line that narrows the list right below it as you type (People's "Find someone", the Inbox's
 * search). A search icon on the left; once there is text, a × on the right clears it and keeps the focus. Esc clears
 * it too. No results panel: rows that still match keep their place.
 */
export function FilterField({
  value,
  defaultValue,
  onChange,
  placeholder = 'Search',
  label,
  autoFocus,
  className,
}: FilterFieldProps) {
  const [val, setVal] = useControllable<string>(value, defaultValue ?? '');
  const input = useRef<HTMLInputElement | null>(null);
  const set = (x: string) => {
    setVal(x);
    onChange?.(x);
  };
  return (
    <label className={cx('tp-root tp-ff', val && 'tp-has', className)}>
      <Icon name="search" size={14} />
      <input
        ref={input}
        value={val}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        type="search"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && val) {
            e.stopPropagation();
            set('');
          }
        }}
      />
      <button
        type="button"
        className={cx('tp-ff-x', !val && 'tp-hide')}
        aria-label="Clear"
        tabIndex={val ? 0 : -1}
        onClick={(e) => {
          e.preventDefault();
          set('');
          input.current?.focus();
        }}
      >
        <Icon name="x" size={12} />
      </button>
    </label>
  );
}
