import { useNavigate, useSearch } from '@tanstack/react-router';
import { useRef } from 'react';
import { ApiError, type MeResponse } from '@tudu/client';
import { welcomeBack } from '@tudu/core';
import { showToast, SignIn, SignInError } from '@tudu/ui';
import { OAUTH_QUERY } from '../../app/oauth';
import { api, authClient, refreshMe } from '../../app/session';
import { useViewport } from '../../app/viewport';

/** Maps Better Auth's error codes to the sign-in form's states. */
export function toSignInError(code: string | undefined, message: string | undefined): SignInError {
  if (code === 'INVALID_OTP')
    return new SignInError('wrong', 'That code didn’t work. Check the email, or send a new one.');
  if (code === 'OTP_EXPIRED')
    return new SignInError('expired', 'That code has expired. Send a new one; it takes a few seconds.');
  if (code === 'TOO_MANY_ATTEMPTS')
    return new SignInError('locked', 'Too many tries. Send a new code and use that one.');
  return new SignInError('other', message || 'That didn’t work. Try again.');
}

/**
 * Someone coming back (an account this sign-in did not make) is greeted by name; a new person lands quietly, and
 * Today and Getting started welcome them instead.
 */
export function greet(me: MeResponse | null): void {
  if (me && me.firstSignIn === false) showToast(welcomeBack(me.user.name));
}

export function SignInPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { next?: string };
  const vp = useViewport();
  // An app sent you here (OAuth): where the API says to go once you're in.
  const oauthNext = useRef<string | null>(null);

  async function sendCode(email: string): Promise<void> {
    // Through the API client so the plain server message (bad address, too many codes) comes back as is.
    await api
      .post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' })
      .catch((err: unknown) => {
        if (err instanceof ApiError) throw new Error(err.message);
        throw new Error('Couldn’t send the code. Check your connection and try again.');
      });
  }

  async function verifyCode(email: string, otp: string): Promise<void> {
    if (OAUTH_QUERY) {
      // The app's signed request rides along; the API answers with the consent page (or the app) to go to.
      const { data, error } = await authClient.$fetch<{ url?: string }>('/sign-in/email-otp', {
        method: 'POST',
        body: { email, otp, oauth_query: OAUTH_QUERY },
      });
      if (error) throw toSignInError((error as { code?: string }).code, error.message);
      oauthNext.current = data?.url ?? null;
      return;
    }
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    if (error) throw toSignInError(error.code, error.message);
  }

  async function done() {
    if (oauthNext.current) {
      window.location.assign(oauthNext.current);
      return;
    }
    greet(await refreshMe());
    const next =
      search.next && search.next.startsWith('/') && !search.next.startsWith('//') ? search.next : '/';
    void navigate({ to: next, replace: true });
  }

  return (
    <SignIn
      open
      phone={vp === 'phone'}
      sendCode={sendCode}
      verifyCode={verifyCode}
      onDone={() => void done()}
    />
  );
}
