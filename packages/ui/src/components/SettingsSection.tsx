import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SettingsSectionProps {
  /** The small mono heading: "Name and colour". Also names the section. */
  title?: string;
  /** Quiet text after the heading, such as a count. */
  aside?: ReactNode;
  /** A line under the heading. */
  sub?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** A group of settings under a small mono heading. */
export function SettingsSection({ title, aside, sub, children, className }: SettingsSectionProps) {
  return (
    <section className={cx('tp-root tp-ssec', className)} aria-label={title}>
      {title ? (
        <div className="tp-ssec-h">
          <span>{title}</span>
          {aside !== undefined && aside !== null ? <span className="tp-ssec-a">{aside}</span> : null}
        </div>
      ) : null}
      {sub ? <p className="tp-ssec-s">{sub}</p> : null}
      <div className="tp-ssec-b">{children}</div>
    </section>
  );
}

export interface SettingRowProps {
  title: ReactNode;
  /** What it does, in a quiet line. */
  sub?: ReactNode;
  /** The switch, button or swatches on the right. */
  control?: ReactNode;
  /** The control takes the whole width under the title (phones, fields). */
  stack?: boolean;
  /** A field under the title, full width. */
  children?: ReactNode;
  className?: string;
}

/** One setting: its title and line on the left, its control on the right; rows are ruled apart. */
export function SettingRow({ title, sub, control, stack, children, className }: SettingRowProps) {
  return (
    <div className={cx('tp-root tp-setrow', stack && 'tp-setrow-stack', className)}>
      <div className="tp-setrow-t">
        <div className="tp-setrow-l">{title}</div>
        {sub ? <div className="tp-setrow-s">{sub}</div> : null}
      </div>
      {control ? <div className="tp-setrow-c">{control}</div> : null}
      {children ? <div className="tp-setrow-x">{children}</div> : null}
    </div>
  );
}
