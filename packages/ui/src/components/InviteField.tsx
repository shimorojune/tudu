import { EMAIL_PATTERN } from '@tudu/core';
import { useRef, useState, type ClipboardEvent } from 'react';
import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { Icon } from '../lib/icons';

export interface InviteFieldProps {
  value?: string[];
  defaultValue?: string[];
  onChange?: (emails: string[]) => void;
  placeholder?: string;
  /** The accessible name, "Invite by email" by default. */
  label?: string;
  autoFocus?: boolean;
  className?: string;
}

/**
 * People to invite, by email. Type or paste addresses; a comma, a space, Enter or leaving the field turns each into
 * a chip. One that is not an email turns its chip and the field's edge red and says so under the field (red only for
 * a real error). × or Backspace takes one out; the same address twice is kept once.
 */
export function InviteField({
  value,
  defaultValue,
  onChange,
  placeholder,
  label = 'Invite by email',
  autoFocus,
  className,
}: InviteFieldProps) {
  const [list, setList] = useControllable<string[]>(value, defaultValue ?? []);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const put = (next: string[]) => {
    setList(next);
    onChange?.(next);
  };
  const commit = (text: string) => {
    const parts = text
      .split(/[\s,;]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...list];
    for (const x of parts) if (!next.some((y) => y.toLowerCase() === x.toLowerCase())) next.push(x);
    put(next);
    setDraft('');
  };
  const bad = list.filter((x) => !EMAIL_PATTERN.test(x));
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData?.getData('text');
    if (t && /[\s,;]/.test(t)) {
      e.preventDefault();
      commit(draft + t);
    }
  };
  return (
    <div className={cx('tp-root tp-invf-w', className)}>
      {/* A div, not a label: a label would hand its clicks to the first chip's × and remove that address. */}
      <div
        className={cx('tp-invf', bad.length && 'tp-bad')}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest?.('button')) input.current?.focus();
        }}
      >
        {list.map((x) => {
          const ok = EMAIL_PATTERN.test(x);
          return (
            <span key={x} className={cx('tp-invf-chip', !ok && 'tp-bad')}>
              <span>{x}</span>
              <button
                type="button"
                aria-label={`Remove ${x}`}
                onClick={(e) => {
                  e.preventDefault();
                  put(list.filter((y) => y !== x));
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          value={draft}
          type="text"
          inputMode="email"
          autoCapitalize="off"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={bad.length ? 'true' : undefined}
          placeholder={list.length ? 'Add another' : (placeholder ?? 'name@company.com, another@company.com')}
          onChange={(e) => {
            const v = e.target.value;
            if (/[\s,;]$/.test(v)) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && list.length) put(list.slice(0, -1));
          }}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </div>
      {bad.length ? (
        <div className="tp-help" role="alert">
          <Icon name="error" size={13} stroke={2.2} />
          {bad.length === 1
            ? `“${bad[0]}” isn’t an email address.`
            : `${bad.length} of these aren’t email addresses.`}
        </div>
      ) : null}
    </div>
  );
}
