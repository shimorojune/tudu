import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import type { JoinResponse, SpaceSummary } from '@tudu/core';
import { ApiError, type MeResponse } from '@tudu/client';
import { AuthLayer, EmptyState, JoinCard, SignIn, showToast, type JoinInvite } from '@tudu/ui';
import { useState } from 'react';
import { api, refreshMe } from '../../app/session';
import { rememberSpace, spacePath } from '../../app/space';
import { useViewport } from '../../app/viewport';
import { toSignInError } from '../sign-in/SignInPage';
import { authClient } from '../../app/session';

/** The join link's words as the card wants them. */
export function toInvite(info: JoinResponse): JoinInvite {
  return {
    space: { name: info.space.name, color: info.space.color ?? undefined, initials: info.space.initials },
    from: info.from,
    count: info.count,
    people: info.people.map((p) => ({
      id: p.id,
      name: p.name,
      initials: p.initials,
      color: p.color ?? undefined,
    })),
  };
}

/** What the card shows for a link: already in, or the link's own state. */
export function joinState(info: JoinResponse): 'open' | 'expired' | 'cancelled' | 'spent' | 'member' {
  if (info.you?.member) return 'member';
  return info.state;
}

/**
 * An invite's link: Join Northwind. Signed in, one button joins and you land on its Today; not signed in, the
 * sign-in form sits under the card with the invited address, and joining follows the code. A dead link says why.
 */
export function JoinPage({ me }: { me: MeResponse | null }) {
  const { token } = useParams({ strict: false }) as { token: string };
  const vp = useViewport();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['join', token],
    queryFn: async (): Promise<JoinResponse> => {
      try {
        return await api.get<JoinResponse>(`/api/join/${encodeURIComponent(token)}`);
      } catch (err) {
        // A dead link still says what it was: the body carries the space and the state.
        if (err instanceof ApiError && err.status === 410 && err.body && typeof err.body === 'object')
          return err.body as JoinResponse;
        throw err;
      }
    },
    retry: false,
    networkMode: 'always',
  });
  const [busy, setBusy] = useState<0 | 1 | 2>(0);

  async function join(): Promise<SpaceSummary> {
    const out = await api.post<{ space: SpaceSummary }>(`/api/join/${encodeURIComponent(token)}`);
    await refreshMe();
    rememberSpace(out.space.slug);
    return out.space;
  }
  async function joinNow() {
    if (busy) return;
    setBusy(1);
    try {
      const space = await join();
      setBusy(2);
      setTimeout(() => void navigate({ href: spacePath(space.slug), replace: true }), 500);
    } catch (err) {
      setBusy(0);
      showToast(err instanceof ApiError ? err.message : 'Couldn’t join. Try again.');
    }
  }

  const info = q.data;
  if (q.isError && !info)
    return (
      <AuthLayer open label="Join">
        <div className="tp-auth-main">
          <div className="tp-auth-stage">
            <EmptyState
              tone="error"
              title="That invite link doesn’t lead anywhere."
              action="Go to Tudu"
              plain
              onAction={() => void navigate({ href: '/', replace: true })}
            >
              Check the link in the email, or ask for a new invite.
            </EmptyState>
          </div>
        </div>
      </AuthLayer>
    );
  if (!info) return <AuthLayer open label="Join" />;
  const invite = toInvite(info);
  const state = joinState(info);
  const home = () => void navigate({ href: '/', replace: true });

  // Signed in: one button, or the way the link stands.
  if (me) {
    const mismatch = state === 'open' && info.you && !info.you.matches;
    return (
      <AuthLayer open phone={vp === 'phone'} label={`Join ${info.space.name}`}>
        <div className="tp-auth-main">
          <div className="tp-auth-stage">
            <JoinCard
              invite={invite}
              state={state}
              busy={busy}
              onJoin={mismatch ? undefined : () => void joinNow()}
              onOpen={
                state === 'member'
                  ? () => void navigate({ href: spacePath(info.space.slug), replace: true })
                  : home
              }
            >
              {mismatch ? (
                <>
                  <p className="tp-auth-fine">
                    This invite was sent to <b>{info.email}</b>, and you are signed in as {me.user.email}.
                    Sign in with that address to join.
                  </p>
                  <button type="button" className="tp-auth-link" onClick={home}>
                    Back to Tudu
                  </button>
                </>
              ) : undefined}
            </JoinCard>
          </div>
        </div>
      </AuthLayer>
    );
  }

  // Not signed in: a dead link says so; an open one has the sign-in steps under the card.
  if (state !== 'open')
    return (
      <AuthLayer open phone={vp === 'phone'} label={`Join ${info.space.name}`}>
        <div className="tp-auth-main">
          <div className="tp-auth-stage">
            <JoinCard
              invite={invite}
              state={state}
              onOpen={() => void navigate({ to: '/sign-in', replace: true })}
            />
          </div>
        </div>
      </AuthLayer>
    );
  return (
    <SignIn
      open
      phone={vp === 'phone'}
      invite={{ ...invite, email: info.email }}
      sendCode={async (email) => {
        await api
          .post('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' })
          .catch((err: unknown) => {
            if (err instanceof ApiError) throw new Error(err.message);
            throw new Error('Couldn’t send the code. Check your connection and try again.');
          });
      }}
      verifyCode={async (email, otp) => {
        const { error } = await authClient.signIn.emailOtp({ email, otp });
        if (error) throw toSignInError(error.code, error.message);
      }}
      onDone={() => {
        void join().then(
          (space) => void navigate({ href: spacePath(space.slug), replace: true }),
          (err: unknown) => {
            showToast(err instanceof ApiError ? err.message : 'Couldn’t join. Try again.');
            void navigate({ href: '/', replace: true });
          },
        );
      }}
    />
  );
}
