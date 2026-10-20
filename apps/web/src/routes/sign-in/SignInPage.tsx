import { useNavigate, useSearch } from '@tanstack/react-router';
import { ApiError } from '@tudu/client';
import { SignIn, SignInError } from '@tudu/ui';
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

export function SignInPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { next?: string };
  const vp = useViewport();

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
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    if (error) throw toSignInError(error.code, error.message);
  }

  async function done() {
    await refreshMe();
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
