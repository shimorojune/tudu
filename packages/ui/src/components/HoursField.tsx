import { useState } from 'react';
import { timeOf } from '@tudu/core';
import { cx } from '../lib/cx';

/**
 * 24-hour time as typed: "9", "930", "9:30" and "9.30" become 09:00 and 09:30 when you leave the field; anything
 * else is null. (A native time input shows AM and PM where the computer does, so Tudu keeps its own.)
 */
export function tidyTime(v: string): string | null {
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(v.trim().replace('.', ':'));
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? timeOf(h * 60 + min) : null;
}

function TimeField({
  label,
  value,
  bad,
  onChange,
}: {
  label: string;
  value: string;
  bad?: boolean;
  onChange?: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const wrong = draft !== null && tidyTime(draft) === null;
  const done = () => {
    if (draft === null) return;
    const t = tidyTime(draft);
    if (!t) return;
    setDraft(null);
    if (t !== value) onChange?.(t);
  };
  return (
    <div className="tp-root">
      <label className={cx('tp-field', (bad || wrong) && 'tp-bad')}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          value={draft ?? value}
          aria-label={label}
          aria-invalid={bad || wrong ? 'true' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
      </label>
    </div>
  );
}

export interface HoursFieldProps {
  start: string;
  end: string;
  /** Names both fields: "Every day" reads "Every day starts at", "Every day ends at". */
  label?: string;
  /** The end is not after the start: the end field's edge goes red. The words are the row's. */
  bad?: boolean;
  onChange?: (v: { start: string; end: string }) => void;
  className?: string;
}

/** From and to: two short 24-hour fields and "to". A value is only given once a field holds a real time. */
export function HoursField({ start, end, label = 'Every day', bad, onChange, className }: HoursFieldProps) {
  return (
    <div className={cx('tp-root tp-hours', className)}>
      <TimeField label={`${label} starts at`} value={start} onChange={(v) => onChange?.({ start: v, end })} />
      <span>to</span>
      <TimeField
        label={`${label} ends at`}
        value={end}
        bad={bad}
        onChange={(v) => onChange?.({ start, end: v })}
      />
    </div>
  );
}
