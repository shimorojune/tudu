import { useQuery } from '@tanstack/react-query';
import { ApiError, type MeResponse } from '@tudu/client';
import type { AiConsentRequest } from '@tudu/core';
import { ALLOWED_MS, OAuthConsent, type AiReach, type OAuthConsentState } from '@tudu/ui';
import { useState } from 'react';
import { api, initialsOf, photoSrc } from '../../app/session';
import { useViewport } from '../../app/viewport';

/** How long "X is connected" shows before the page goes back to the app. */
const BACK_MS = 700;

/**
 * The consent page an app's OAuth request lands on: who's asking, what it may do, Allow or Cancel. Either way the API
 * answers where the app wants you back, with a code or with `access_denied`.
 */
export function ConsentPage({ me }: { me: MeResponse }) {
  const vp = useViewport();
  // The request is signed: it goes to the API exactly as it came.
  const [query] = useState(() => window.location.search.slice(1));
  const [after, setAfter] = useState<OAuthConsentState | null>(null);
  const [reason, setReason] = useState<string | undefined>();
  const req = useQuery({
    queryKey: ['oauth-request', query],
    queryFn: () => api.get<AiConsentRequest>(`/api/oauth/request?${query}`),
    retry: false,
    staleTime: Infinity,
  });
  const failed = (err: unknown) => {
    setReason(err instanceof ApiError ? err.message : undefined);
    setAfter('error');
  };
  const state: OAuthConsentState = after ?? (req.isPending ? 'loading' : req.isError ? 'error' : 'ask');
  const app = req.data?.app;

  return (
    <OAuthConsent
      phone={vp === 'phone'}
      state={state}
      reason={reason ?? (req.error instanceof ApiError ? req.error.message : undefined)}
      client={
        app
          ? { name: app.name, host: app.host ?? undefined, verified: app.verified, icon: app.icon }
          : undefined
      }
      me={{
        name: me.user.name || me.user.email,
        email: me.user.email,
        initials: initialsOf(me.user.name, me.user.email),
        color: me.user.color ?? undefined,
        image: photoSrc(me.user.image),
      }}
      spaces={req.data?.spaces.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? undefined,
        personal: s.kind === 'personal',
      }))}
      onAllow={async (reach: AiReach) => {
        const out = await api
          .post<{ url: string }>('/api/oauth/allow', { query, reach })
          .catch((err: unknown) => {
            // A link that ran out or was changed has nothing to retry: the page says so.
            if (err instanceof ApiError && err.status === 400) failed(err);
            throw new Error(err instanceof ApiError ? err.message : '', { cause: err });
          });
        setTimeout(() => {
          setAfter('done');
          setTimeout(() => window.location.assign(out.url), BACK_MS);
        }, ALLOWED_MS);
      }}
      onDeny={() =>
        void api.post<{ url: string }>('/api/oauth/deny', { query }).then((out) => {
          setAfter('denied');
          window.location.assign(out.url);
        }, failed)
      }
    />
  );
}
