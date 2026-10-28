import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { AppMark } from './AppMark';
import { Banner } from './Banner';
import { Button } from './Button';
import { CopyLink } from './CopyBox';
import { SettingRow, SettingsSection } from './SettingsSection';
import { Skeleton } from './Skeleton';

/** What an app or key may do: read, or read and change; changing may include deleting. */
export type AiLevel = 'read' | 'write';

/** One app you allowed, or one key you made, as Settings › AI access lists it. */
export interface AiGrant {
  id: string;
  name: string;
  level: AiLevel;
  /** Read and write only: it may also delete (to Trash). */
  del?: boolean;
  /** `all`, or the names of the spaces it reaches. */
  spaces: 'all' | string[];
  notebook?: boolean;
  /** "2 hours ago"; left out, not used yet. */
  lastUsed?: string;
  /** A key that ran out: it stays listed until you remove it. */
  state?: 'ok' | 'expired';
  /** When it ran out: "on 3 Oct". */
  expires?: string;
  /** Just made: the row glows once. */
  highlight?: boolean;
  /** Going: the row folds away. */
  leaving?: boolean;
}

export interface AiApp extends AiGrant {
  /** Known by where it sends you back (Claude, ChatGPT, Cursor); `false` shows Unverified. */
  verified?: boolean;
  icon?: string | null;
}

export interface AiAccessData {
  /** The MCP server's address, for Copy link. */
  url: string;
  /** State boards: Copied already. */
  urlCopied?: boolean;
  apps?: AiApp[];
  keys?: AiGrant[];
  loading?: boolean;
  /** The list couldn't be read: a banner with Try again, nothing else. */
  error?: boolean;
}

export interface AiAccessProps {
  access: AiAccessData;
  /** New key. */
  onCreate?: () => void;
  /** Disconnect an app, revoke a key, or remove one that expired. */
  onRevoke?: (x: AiGrant, kind: 'app' | 'key') => void;
  onRetry?: () => void;
}

/** "Can read and change all your spaces and your Notebook · used 2 hours ago". */
export function aiLine(x: AiGrant): string {
  if (x.state === 'expired') return `${x.expires ? `Expired ${x.expires}.` : 'Expired.'} It no longer works.`;
  const what =
    x.level === 'write' ? (x.del ? 'Can read, change and delete' : 'Can read and change') : 'Can only read';
  const where =
    x.spaces === 'all'
      ? 'all your spaces'
      : x.spaces.length === 1
        ? x.spaces[0]!
        : `${x.spaces.length} spaces`;
  return `${what} ${where}${x.notebook ? ' and your Notebook' : ''} · ${x.lastUsed ? `used ${x.lastUsed}` : 'not used yet'}`;
}

function SkeletonRow({ i }: { i: number }) {
  return (
    <div className="tp-setrow tp-set-sprow tp-set-skl">
      <span className="tp-skel" style={{ width: 22, height: 22, borderRadius: 7 }} />
      <div className="tp-setrow-t">
        <Skeleton width={[96, 120][i % 2]} height={12} />
        <div style={{ height: 6 }} />
        <Skeleton width={[200, 160][i % 2]} height={8} />
      </div>
      <span className="tp-skel" style={{ width: 84, height: 30, borderRadius: 10 }} />
    </div>
  );
}

/**
 * Settings › AI access: the MCP server's address, the apps you let in, and your keys. It reads like Apps on purpose:
 * plain rows, one quiet line, one button on the right, a note at the foot. An app or key can do what you can in Tudu,
 * never more, and never your account.
 */
export function AiAccess({ access: a, onCreate, onRevoke, onRetry }: AiAccessProps) {
  const apps = a.apps ?? [];
  const keys = a.keys ?? [];
  const row = (x: AiGrant & Partial<AiApp>, kind: 'app' | 'key') => (
    <div key={x.id} className={cx('tp-set-sprow', x.highlight && 'tp-set-hl', x.leaving && 'tp-ai-leaving')}>
      <SettingRow
        title={
          <span className="tp-set-app">
            {kind === 'app' ? (
              <AppMark name={x.name} icon={x.icon} size={22} />
            ) : (
              <span className="tp-ai-kic" aria-hidden="true">
                <Icon name="key" size={13} />
              </span>
            )}
            {x.name}
            {x.verified === false ? <span className="tp-set-here tp-ai-unv">Unverified</span> : null}
          </span>
        }
        sub={x.state === 'expired' ? <span className="tp-ai-exp">{aiLine(x)}</span> : aiLine(x)}
        control={
          <Button variant="secondary" size="sm" onClick={() => onRevoke?.(x, kind)}>
            {kind === 'app' ? 'Disconnect' : x.state === 'expired' ? 'Remove' : 'Revoke'}
          </Button>
        }
      />
    </div>
  );
  return (
    <div className="tp-set-apps tp-set-ai">
      {a.error ? (
        <Banner
          tone="warning"
          title="Couldn’t load your apps and keys."
          action="Try again"
          onAction={onRetry}
        >
          They keep working as they were.
        </Banner>
      ) : null}
      <SettingsSection title="Use Tudu elsewhere">
        <SettingRow
          title="Claude, ChatGPT and other apps"
          sub="Add Tudu as a connector there with this link. You sign in to Tudu and choose what it can do."
          control={<CopyLink value={a.url} copied={a.urlCopied} />}
        />
      </SettingsSection>
      {a.error ? null : (
        <SettingsSection
          title="Connected"
          aside={a.loading || !apps.length ? undefined : String(apps.length)}
        >
          {a.loading ? (
            [0, 1].map((i) => <SkeletonRow key={i} i={i} />)
          ) : apps.length ? (
            apps.map((x) => row(x, 'app'))
          ) : (
            <p className="tp-set-note tp-ai-none">Nothing yet. Apps you allow show up here.</p>
          )}
        </SettingsSection>
      )}
      {a.error ? null : (
        <SettingsSection title="Keys" aside={a.loading || !keys.length ? undefined : String(keys.length)}>
          <SettingRow
            title="Make a key"
            sub="For tools that can’t sign in with a browser, like Claude Code."
            control={
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="plus" size={14} />}
                disabled={a.loading}
                onClick={onCreate}
              >
                New key
              </Button>
            }
          />
          {a.loading ? [0, 1].map((i) => <SkeletonRow key={i} i={i} />) : keys.map((x) => row(x, 'key'))}
        </SettingsSection>
      )}
      <p className="tp-set-note">
        Apps and keys can do what you can in Tudu, never more. They can’t change your account or your spaces’
        people.
      </p>
    </div>
  );
}
