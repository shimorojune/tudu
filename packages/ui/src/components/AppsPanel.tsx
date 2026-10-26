import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { JiraMark } from './JiraMark';

export interface AppsPanelApp {
  id: string;
  name: string;
  /** One line on what it does, while it is not connected. */
  blurb: string;
  connected?: boolean;
  /** Once connected: "As asha@… on jira.northwind.io." */
  status?: string;
  /** Connected for your account, but off in this space: Turn on here, no second token. */
  off?: boolean;
  /** Turning on here (off) or off here (on): the button spins "Turning on…" / "Turning off…". */
  busy?: boolean;
  /** Why it couldn't be turned off here; shown under the row, and the app stays on. */
  error?: string;
  mark?: ReactNode;
}

export interface AppsPanelProps {
  apps: AppsPanelApp[];
  title?: string;
  compact?: boolean;
  /** The space you are in, for "Turn it on to use it in Acme Studio." */
  spaceName?: string;
  onEnable?: (id: string) => void;
  /** Connected and on here: a quiet Turn off here under the status line. */
  onDisable?: (id: string) => void;
  onConnect?: (id: string) => void;
  onOpen?: (id: string) => void;
  onClose?: () => void;
  className?: string;
}

function TickMark() {
  return (
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
      <path d="M5.5 12.2 10 16.6 18.8 7" />
    </svg>
  );
}

function Spin() {
  return (
    <svg className="tp-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}

/**
 * The optional apps Tudu can connect to. Tudu works on its own; an app shows up in the sidebar, the top bar and
 * the phone's tabs only once it is connected. Today the list holds Jira.
 */
export function AppsPanel({
  apps,
  title = 'Apps',
  compact,
  spaceName,
  onEnable,
  onDisable,
  onConnect,
  onOpen,
  onClose,
  className,
}: AppsPanelProps) {
  return (
    <section className={cx('tp-root tp-apps', compact && 'tp-compact', className)} aria-label="Apps">
      <div className="tp-apps-top">
        <h2>{title}</h2>
        {onClose ? (
          <IconButton label="Close" tipSide="bottom-end" onClick={onClose}>
            <Icon name="x" size={16} />
          </IconButton>
        ) : null}
      </div>
      <p className="tp-apps-lead">
        Bring work from the tools you use next to your day. Everything here is optional; Tudu works fine on
        its own.
      </p>
      <ul className="tp-apps-list">
        {apps.map((a) => (
          <li key={a.id} className={cx('tp-app', a.connected && 'tp-on')}>
            <span className="tp-app-mark" aria-hidden="true">
              {a.id === 'jira' ? <JiraMark size={22} /> : (a.mark ?? <Icon name="plug" size={20} />)}
            </span>
            <div className="tp-app-main">
              <div className="tp-app-name">
                {a.name}
                {a.connected ? (
                  <span className="tp-app-ok">
                    <TickMark />
                    {a.off ? 'Connected · off here' : 'Connected'}
                  </span>
                ) : null}
              </div>
              <p>
                {a.connected && a.off
                  ? `Connected to your account. Turn it on to use it in ${spaceName || 'this space'}.`
                  : a.connected && a.status
                    ? a.status
                    : a.blurb}
              </p>
              {a.connected && !a.off ? (
                <button
                  type="button"
                  className={cx('tp-app-off', a.busy && 'tp-busy')}
                  disabled={!!a.busy}
                  aria-label={`Turn off ${a.name} in ${spaceName || 'this space'}`}
                  onClick={() => onDisable?.(a.id)}
                >
                  {a.busy ? <Spin /> : null}
                  {a.busy ? 'Turning off…' : 'Turn off here'}
                </button>
              ) : null}
              {a.error ? (
                <p className="tp-app-err" role="alert">
                  {a.error}
                </p>
              ) : null}
            </div>
            {a.connected && a.off ? (
              <Button
                variant="primary"
                size="sm"
                loading={!!a.busy}
                loadingLabel="Turning on…"
                aria-label={`Turn on ${a.name} here`}
                onClick={() => onEnable?.(a.id)}
              >
                Turn on here
              </Button>
            ) : a.connected ? (
              <Button
                variant="secondary"
                size="sm"
                aria-label={`Open ${a.name}`}
                onClick={() => onOpen?.(a.id)}
              >
                Open
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                aria-label={`Connect ${a.name}`}
                onClick={() => onConnect?.(a.id)}
              >
                Connect
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="tp-apps-fine">More apps will show up here.</p>
    </section>
  );
}
