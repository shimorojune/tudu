import { useState } from 'react';
import { copyText, COPY_FAILED_WORDS } from '../lib/clipboard';
import { cx } from '../lib/cx';
import { useTimer } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { showToast } from './Toast';

export interface IssueLinkProps {
  /** The issue's address: "https://github.com/shimorojune/tudu/issues/142". */
  url: string;
  className?: string;
}

/** How long Copy holds its tick, as the task ID chip does. */
export const ISSUE_COPIED_MS = 700;

/** The issue's address in a quiet row, with Copy. Copy turns into a tick for a moment once the link is copied. */
export function IssueLink({ url, className }: IssueLinkProps) {
  const [copied, setCopied] = useState(false);
  const later = useTimer();
  const copy = async () => {
    if (!(await copyText(url))) {
      showToast(COPY_FAILED_WORDS);
      return;
    }
    setCopied(true);
    later(() => setCopied(false), ISSUE_COPIED_MS);
  };
  return (
    <div className={cx('tp-issue-link', className)}>
      <span className="tp-issue-url">{url.replace(/^https?:\/\//, '')}</span>
      <button
        type="button"
        className={cx('tp-issue-copy', copied && 'tp-ok')}
        aria-label={copied ? 'Copied the issue link' : 'Copy the issue link'}
        onClick={() => void copy()}
      >
        <span className="tp-issue-ic" aria-hidden="true">
          <Icon name="link" size={13} className="tp-issue-ln" />
          <Icon name="check" size={13} stroke={2.4} className="tp-issue-ok" />
        </span>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
