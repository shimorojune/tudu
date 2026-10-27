import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { EMAIL_PATTERN } from '@tudu/core';
import { cx } from '../lib/cx';
import { useFieldId, useTimer } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { TICK_PATH } from '../lib/ink';
import { AuthArt, AuthLayer, type AuthArtProps } from './AuthLayer';
import { Button } from './Button';
import { CodeField } from './CodeField';
import { JoinHead, type JoinInvite } from './JoinCard';
import { Logo } from './Logo';
import { showToast } from './Toast';

export type SignInErrorKind = 'wrong' | 'expired' | 'locked' | 'other';

/** What `verifyCode` rejects with. The kind picks what the boxes do next; the message is the line under them. */
export class SignInError extends Error {
  constructor(
    readonly kind: SignInErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

export type SignInStep = 'email' | 'code';

/** A starting state, for the state boards and tests. */
export interface SignInInitial {
  email?: string;
  code?: string;
  /** 0 at rest, 1 sending or checking, 2 you're in. */
  busy?: 0 | 1 | 2;
  error?: string | null;
  /** Too many tries: the boxes rest until a new code is sent. */
  locked?: boolean;
  /** Seconds before Send a new code is available. */
  wait?: number;
  /** Leave focus where it is. */
  noFocus?: boolean;
}

export interface SignInProps {
  open: boolean;
  /** Draws it in place, without the layer (state boards, tests). */
  inline?: boolean;
  /** The form alone. */
  phone?: boolean;
  /** The first step shown. */
  step?: SignInStep;
  initial?: SignInInitial;
  title?: string;
  lead?: string;
  /** Seconds before Send a new code is available again, 30 by default. */
  resendSeconds?: number;
  /** The picture of the day beside the form on the desktop: its day, date, week and caption. */
  art?: AuthArtProps;
  /**
   * Sign in to join: the card names the space and who asked, the email is the one invited and cannot be changed,
   * and "You're in" says the space is opening.
   */
  invite?: JoinInvite & { email: string };
  /** Emails a code. Rejects with an Error whose message is shown under the field. */
  sendCode: (email: string) => Promise<void>;
  /** Checks the code. Rejects with a SignInError. */
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Called 500ms after "You're in", once the tick has popped. */
  onDone: (info: { email: string }) => void;
}

export { EMAIL_PATTERN };
/** The tick pops in (200ms), then the page gives way. */
export const DONE_DELAY_MS = 500;
export const DEFAULT_RESEND_SECONDS = 30;

const NOT_AN_EMAIL = 'That doesn’t look like an email address.';
const FALLBACK = 'Something went wrong. Try again.';

function messageOf(e: unknown): string {
  return e instanceof Error && e.message ? e.message : FALLBACK;
}

/** 30 as "0:30", 75 as "1:15". */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function stay(e: MouseEvent) {
  e.preventDefault();
}

/**
 * Sign in and sign up are the same two steps, with no password: your email, then the 6-digit code from the email.
 * Desktop pairs the form with a picture of the day; phones show the form alone. Six digits check themselves; a wrong
 * code nudges the boxes; Send a new code counts down; Use a different email slides back.
 */
export function SignIn({
  open,
  inline,
  phone,
  step: firstStep = 'email',
  initial = {},
  title,
  lead,
  resendSeconds = DEFAULT_RESEND_SECONDS,
  art,
  invite,
  sendCode,
  verifyCode,
  onDone,
}: SignInProps) {
  const [step, setStep] = useState<SignInStep>(firstStep);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [email, setEmail] = useState(initial.email ?? invite?.email ?? '');
  const [code, setCode] = useState(initial.code ?? '');
  const [busy, setBusy] = useState<0 | 1 | 2>(initial.busy ?? 0);
  const [err, setErr] = useState<string | null>(initial.error ?? null);
  const [errKey, setErrKey] = useState(0);
  const [locked, setLocked] = useState(!!initial.locked);
  const [wait, setWait] = useState(initial.wait ?? resendSeconds);
  const emailId = useFieldId(undefined, 'email', 'tp-auth');
  const emailErrId = `${emailId}-err`;
  const alive = useRef(true);
  const later = useTimer();
  const address = email.trim();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Send a new code counts down one second at a time while the code step shows.
  useEffect(() => {
    if (step !== 'code' || wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [step, wait]);

  function go(next: SignInStep, d: 'next' | 'prev' = 'next') {
    setDir(d);
    setStep(next);
    setErr(null);
  }

  function fail(message: string) {
    setErr(message);
    setErrKey((k) => k + 1);
  }

  async function submitEmail() {
    if (!EMAIL_PATTERN.test(address)) {
      fail(NOT_AN_EMAIL);
      return;
    }
    if (busy) return;
    setBusy(1);
    try {
      await sendCode(address);
      if (!alive.current) return;
      setBusy(0);
      setCode('');
      setWait(resendSeconds);
      setLocked(false);
      go('code');
    } catch (e) {
      if (!alive.current) return;
      setBusy(0);
      fail(messageOf(e));
    }
  }

  async function verify(value: string) {
    if (busy) return;
    setBusy(1);
    setErr(null);
    try {
      await verifyCode(address, value);
      if (!alive.current) return;
      setBusy(2);
      later(() => onDone({ email: address }), DONE_DELAY_MS);
    } catch (e) {
      if (!alive.current) return;
      setBusy(0);
      fail(messageOf(e));
      const kind = e instanceof SignInError ? e.kind : 'other';
      // a wrong code empties the boxes; a locked one too (the states board shows them empty and at rest)
      if (kind === 'wrong' || kind === 'locked') setCode('');
      if (kind === 'expired' || kind === 'locked') setWait(0);
      if (kind === 'locked') setLocked(true);
    }
  }

  async function resend() {
    if (wait > 0 || busy) return;
    setWait(resendSeconds);
    setCode('');
    setErr(null);
    setLocked(false);
    try {
      await sendCode(address);
      if (!alive.current) return;
      showToast(`A new code is on its way to ${address}.`);
    } catch (e) {
      if (!alive.current) return;
      fail(messageOf(e));
      setWait(0);
    }
  }

  const who = invite?.from?.name ?? 'Someone';
  const page =
    step === 'email' ? (
      <div className="tp-auth-page">
        {invite ? (
          <JoinHead
            invite={invite}
            eyebrow="You’re invited"
            title={`Join ${invite.space.name}`}
            lead={
              <>
                <b>{who}</b> invited you to {invite.space.name}, where{' '}
                {invite.count <= 1 ? 'it’s just them for now' : `${invite.count} people share their work`} in
                Tudu. Sign in to join.
              </>
            }
          />
        ) : (
          <>
            <h1>{title ?? 'Sign in to Tudu'}</h1>
            <p className="tp-auth-lead">
              {lead ?? 'Your email is all it takes. We’ll send you a code; no password to remember.'}
            </p>
          </>
        )}
        <label className="tp-auth-l" htmlFor={emailId}>
          Email
        </label>
        <label className={cx('tp-field tp-auth-field', err && 'tp-bad')}>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            readOnly={!!invite}
            aria-describedby={invite ? `${emailId}-inv` : err ? emailErrId : undefined}
            placeholder="you@company.com"
            autoFocus={!initial.noFocus}
            aria-invalid={err ? 'true' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (err) setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitEmail();
            }}
          />
        </label>
        {err ? (
          <div className="tp-help" id={emailErrId} role="alert">
            <Icon name="error" size={13} stroke={2.2} />
            {err}
          </div>
        ) : null}
        {invite ? (
          <p className="tp-auth-fine" id={`${emailId}-inv`}>
            The invite was sent to this address.
          </p>
        ) : null}
        <Button
          className="tp-auth-go"
          loading={busy === 1}
          loadingLabel="Sending a code…"
          onClick={() => void submitEmail()}
        >
          {invite ? 'Sign in to join' : 'Continue'}
        </Button>
        <p className="tp-auth-fine">
          {invite
            ? `New to Tudu? Same steps; we’ll set you up, then take you to ${invite.space.name}.`
            : 'New to Tudu? Same steps; we’ll set you up.'}
        </p>
      </div>
    ) : (
      <div className="tp-auth-page">
        <h1>Check your email</h1>
        <p className="tp-auth-lead">
          We sent a 6-digit code to <b>{address}</b>. It works for 10 minutes.
        </p>
        <CodeField
          value={code}
          onChange={(v) => {
            setCode(v);
            if (err) setErr(null);
          }}
          onComplete={(v) => void verify(v)}
          error={err}
          errorKey={errKey}
          disabled={busy > 0 || locked}
          autoFocus={!initial.noFocus}
        />
        <div className={cx('tp-auth-status', busy === 2 && 'tp-ok')} aria-live="polite">
          {busy === 1 ? (
            <>
              <svg
                className="tp-spin"
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx={12} cy={12} r={9} stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
              </svg>
              Checking…
            </>
          ) : busy === 2 ? (
            <>
              <span className="tp-auth-tick">
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={TICK_PATH} />
                </svg>
              </span>
              {invite ? `You’re in. Opening ${invite.space.name}…` : 'You’re in.'}
            </>
          ) : null}
        </div>
        <div className="tp-auth-links">
          <button
            type="button"
            className="tp-auth-link"
            disabled={wait > 0 || busy > 0}
            onClick={() => void resend()}
          >
            {wait > 0 ? `Send a new code in ${countdown(wait)}` : 'Send a new code'}
          </button>
          {invite ? null : (
            <span className="tp-auth-dot" aria-hidden="true">
              ·
            </span>
          )}
          {invite ? null : (
            <button
              type="button"
              className="tp-auth-link"
              disabled={busy > 0}
              onClick={() => go('email', 'prev')}
            >
              Use a different email
            </button>
          )}
        </div>
      </div>
    );

  return (
    <AuthLayer
      open={open}
      inline={inline}
      phone={phone}
      side={!inline && !invite}
      label={invite ? `Join ${invite.space.name}` : 'Sign in'}
    >
      <div className="tp-auth-main">
        <header className="tp-auth-top">
          <Logo size={24} wordmark />
        </header>
        <div key={step} className={cx('tp-auth-stage', `tp-auth-${dir}`)}>
          {page}
        </div>
        <footer className="tp-auth-foot">
          By continuing you agree to Tudu’s{' '}
          <a href="#" onClick={stay}>
            Terms
          </a>{' '}
          and{' '}
          <a href="#" onClick={stay}>
            Privacy
          </a>
          .
        </footer>
      </div>
      {!phone && !inline && !invite ? <AuthArt {...art} /> : null}
    </AuthLayer>
  );
}
