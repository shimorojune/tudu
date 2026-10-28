import { useState } from 'react';
import { copyText, COPY_FAILED_WORDS } from '../lib/clipboard';
import { cx } from '../lib/cx';
import { useTimer } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { showToast } from './Toast';

/** How long Copy says Copied. */
export const COPIED_MS = 1800;

/** Copies, then says Copied for a moment; a copy the browser refused says so in a toast. */
function useCopy(value: string, failed: string, copied?: boolean) {
  const [done, setDone] = useState(!!copied);
  const timer = useTimer();
  const go = () => {
    if (done) return;
    void copyText(value).then((ok) => {
      if (!ok) return showToast(failed);
      setDone(true);
      timer(() => setDone(false), COPIED_MS);
    });
  };
  return [done, go] as const;
}

export interface CopyBoxProps {
  /** What's copied, shown in mono. */
  value: string;
  /** Names the value for screen readers: "Your new API key". */
  label: string;
  /** A secret shown once: a stronger box, and Copy is the primary button. */
  secret?: boolean;
  /** A command or settings block: the value wraps and keeps its line breaks. */
  block?: boolean;
  /** The button's word, Copy by default. */
  action?: string;
  /** State boards: Copied already. */
  copied?: boolean;
  className?: string;
}

/** A value in mono with Copy beside it. Copy turns into Copied with a tick, then back. */
export function CopyBox({ value, label, secret, block, action = 'Copy', copied, className }: CopyBoxProps) {
  const [done, go] = useCopy(value, 'Couldn’t copy it. Select it and copy instead.', copied);
  return (
    <div className={cx('tp-root tp-ai-copy', secret && 'tp-ai-secret', block && 'tp-ai-block', className)}>
      <code className="tp-ai-val" aria-label={label}>
        {value}
      </code>
      <Button
        variant={secret ? 'primary' : 'secondary'}
        size="sm"
        success={done}
        successLabel="Copied"
        icon={<Icon name="copy" size={14} />}
        onClick={go}
      >
        {action}
      </Button>
    </div>
  );
}

export interface CopyLinkProps {
  value: string;
  /** Copy link by default. */
  label?: string;
  copied?: boolean;
}

/** A quiet button that puts a link on the clipboard and says Copied for a moment. */
export function CopyLink({ value, label = 'Copy link', copied }: CopyLinkProps) {
  const [done, go] = useCopy(value, COPY_FAILED_WORDS, copied);
  return (
    <Button
      variant="secondary"
      size="sm"
      success={done}
      successLabel="Copied"
      icon={<Icon name="link" size={14} />}
      onClick={go}
    >
      {label}
    </Button>
  );
}
