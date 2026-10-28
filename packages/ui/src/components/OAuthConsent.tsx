import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../lib/icons';
import { TICK_PATH } from '../lib/ink';
import {
  AccessPick,
  ReachMore,
  spacesWords,
  useReach,
  type AiReach,
  type AiReachInitial,
  type AiSpace,
} from './AiReach';
import { AppMark } from './AppMark';
import { AuthLayer } from './AuthLayer';
import { Button } from './Button';
import { Logo } from './Logo';
import { PersonDot, type PersonDotPerson } from './PersonDot';
import { Skeleton } from './Skeleton';

/** The app asking: its name, where it sends you back, and whether Tudu knows it. */
export interface AiClient {
  name: string;
  host?: string;
  /** `false` adds "Tudu can’t confirm who made this app." */
  verified?: boolean;
  icon?: string | null;
}

export type OAuthConsentState = 'loading' | 'ask' | 'error' | 'denied' | 'done';

export interface OAuthConsentProps {
  state: OAuthConsentState;
  client?: AiClient;
  me?: PersonDotPerson & { name: string; email: string };
  spaces?: AiSpace[];
  /** `error`: why, in place of the usual line. */
  reason?: string;
  /** Allow: resolves once Tudu has kept it (the page then sends you back), or rejects with the reason to show. */
  onAllow?: (reach: AiReach) => Promise<void>;
  onDeny?: () => void;
  /** State boards and tests. */
  initial?: AiReachInitial & { more?: boolean; busy?: 0 | 1 | 2 };
  inline?: boolean;
  phone?: boolean;
}

/** How long Allowed shows before the page says it's connected. */
export const ALLOWED_MS = 500;

/** "Read and write · can delete · All spaces · Notebook". */
export function reachWords(spaces: AiSpace[], r: AiReach): string {
  return [r.level === 'write' ? 'Read and write' : 'Read only']
    .concat(r.canDelete ? ['can delete'] : [])
    .concat([spacesWords(spaces, r)])
    .concat(r.notebook ? ['Notebook'] : [])
    .join(' · ');
}

/**
 * The Tudu page an app sends you to: who's asking, who you are, one line of what it may do (Change opens the
 * choices), then Allow. New apps get Read and write, without delete, by default.
 */
export function OAuthConsent(p: OAuthConsentProps) {
  const c = p.client ?? { name: 'An app' };
  const spaces = p.spaces ?? [];
  const init = p.initial ?? {};
  const r = useReach(init, 'write');
  const [more, setMore] = useState(!!init.more);
  const [busy, setBusy] = useState<0 | 1 | 2>(init.busy ?? 0);
  const [err, setErr] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function allow() {
    if (busy) return;
    setBusy(1);
    setErr(null);
    try {
      await p.onAllow?.(r.reach);
      if (alive.current) setBusy(2);
    } catch (e) {
      if (!alive.current) return;
      setBusy(0);
      setErr(
        e instanceof Error && e.message
          ? e.message
          : 'Couldn’t allow it. Check your connection and try again.',
      );
    }
  }

  let page: ReactNode;
  if (p.state === 'loading')
    page = (
      <div className="tp-auth-page tp-oc" aria-busy="true">
        <span className="tp-skel" style={{ width: 48, height: 48, borderRadius: 14 }} />
        <div style={{ height: 18 }} />
        <Skeleton width={300} height={30} />
        <div style={{ height: 12 }} />
        <Skeleton width={220} height={12} />
        <div style={{ height: 28 }} />
        <Skeleton height={52} />
        <div style={{ height: 12 }} />
        <Skeleton height={52} />
      </div>
    );
  else if (p.state === 'error')
    page = (
      <div className="tp-auth-page tp-oc">
        <span className="tp-empty-mark">
          <Icon name="error" size={28} />
        </span>
        <h1>This link didn’t work</h1>
        <p className="tp-auth-lead">
          {p.reason || 'It expired or was changed on the way. Go back to the app and connect again.'}
        </p>
      </div>
    );
  else if (p.state === 'denied')
    page = (
      <div className="tp-auth-page tp-oc">
        <AppMark name={c.name} icon={c.icon} size={48} />
        <h1>Nothing was shared</h1>
        <p className="tp-auth-lead">You can close this tab.</p>
      </div>
    );
  else if (p.state === 'done')
    page = (
      <div className="tp-auth-page tp-oc tp-oc-done">
        <span className="tp-oc-tick">
          <svg
            width={22}
            height={22}
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
        </span>
        <h1>{`${c.name} is connected`}</h1>
        <p className="tp-auth-lead">{`Taking you back to ${c.host || 'the app'}…`}</p>
      </div>
    );
  else
    page = (
      <div className="tp-auth-page tp-oc">
        <div className="tp-oc-who">
          <AppMark name={c.name} icon={c.icon} size={48} />
          <span className="tp-oc-link" aria-hidden="true" />
          <Logo size={34} />
        </div>
        <h1>{`Allow ${c.name}?`}</h1>
        <p className="tp-auth-lead">
          {c.verified === false ? (
            <span className="tp-oc-unv">Tudu can’t confirm who made this app. </span>
          ) : null}
          It will use your Tudu as you, then send you back to <b>{c.host || 'the app'}</b>.
        </p>
        {p.me ? (
          <div className="tp-auth-as">
            <PersonDot person={p.me} size={32} />
            <span>
              <b>{p.me.name}</b>
              <span>{p.me.email}</span>
            </span>
          </div>
        ) : null}
        {more ? (
          <div className="tp-oc-box">
            <AccessPick r={r} />
            <ReachMore r={r} spaces={spaces} />
          </div>
        ) : (
          <div className="tp-ak-sum tp-oc-sum">
            <span>{reachWords(spaces, r.reach)}</span>
            <button type="button" className="tp-auth-link" onClick={() => setMore(true)}>
              Change
            </button>
          </div>
        )}
        {err ? (
          <div className="tp-help" role="alert">
            <Icon name="error" size={13} stroke={2.2} />
            {err}
          </div>
        ) : null}
        <div className="tp-oc-acts">
          <Button variant="quiet" disabled={busy > 0} onClick={p.onDeny}>
            Cancel
          </Button>
          <span className="tp-cs-sp" />
          <Button
            disabled={r.scope === 'pick' && !r.picked.length}
            loading={busy === 1}
            loadingLabel="Allowing…"
            success={busy === 2}
            successLabel="Allowed"
            onClick={() => void allow()}
          >
            Allow
          </Button>
        </div>
        <p className="tp-auth-fine">
          It never gets your account, people or space settings. Revoke it in Settings › AI access.
        </p>
      </div>
    );
  return (
    <AuthLayer open inline={p.inline} phone={p.phone} label={`Allow ${c.name}`}>
      <div className="tp-auth-main">
        <header className="tp-auth-top">
          <Logo size={24} wordmark />
        </header>
        <div key={p.state} className="tp-auth-stage tp-auth-next">
          {page}
        </div>
      </div>
    </AuthLayer>
  );
}
