import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export type TagTone = 'team' | 'project' | 'jira' | 'neutral';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  /** Tone means something: a space, a project, a Jira key. Never decoration. */
  tone?: TagTone;
}

/** A small pill for spaces, projects, Jira keys and dates, in the task detail and pickers. */
export function Tag({ children, tone = 'neutral', className, ...rest }: TagProps) {
  return (
    <span
      className={cx('tp-root tp-tag', tone !== 'neutral' && `tp-tag-${tone}`, className)}
      data-tone={tone}
      {...rest}
    >
      {children}
    </span>
  );
}
