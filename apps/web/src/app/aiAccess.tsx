import { useQuery } from '@tanstack/react-query';
import {
  dayWords,
  disconnectAppAsk,
  revokeKeyAsk,
  usedWords,
  type AiAppRow,
  type AiAppsResponse,
  type AiKeyRow,
  type AiKeysResponse,
  type AiNewKeyResponse,
  type Ask,
  type SpaceSummary,
} from '@tudu/core';
import { ApiError } from '@tudu/client';
import { ApiKeyDialog, KEY_FAILED_WORDS, type AiAccessData, type AiDraft, type AiGrant } from '@tudu/ui';
import { useEffect, useState } from 'react';
import { api, queryClient } from './session';

export const AI_KEYS = ['ai', 'keys'] as const;
export const AI_APPS = ['ai', 'apps'] as const;

/** How long a revoked row takes to fold away before it leaves the list. */
const FOLD_MS = 220;
/** How long a new key's row glows. */
const GLOW_MS = 1900;

const keysQuery = { queryKey: AI_KEYS, queryFn: () => api.get<AiKeysResponse>('/api/keys') };
const appsQuery = { queryKey: AI_APPS, queryFn: () => api.get<AiAppsResponse>('/api/apps') };

/** An app or key's spaces by name, for its line: all, or the ones of yours it reaches. */
function spacesOf(ids: string[] | null, spaces: SpaceSummary[]): 'all' | string[] {
  if (!ids) return 'all';
  return ids.map((id) => spaces.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
}

function grantOf(x: AiKeyRow | AiAppRow, id: string, spaces: SpaceSummary[], now: Date): AiGrant {
  return {
    id,
    name: x.name,
    level: x.level,
    del: x.canDelete,
    spaces: spacesOf(x.spaces, spaces),
    notebook: x.notebook,
    lastUsed: x.lastUsedAt ? usedWords(x.lastUsedAt, now) : undefined,
  };
}

interface Revoking {
  ask: Ask;
  run: () => Promise<void>;
}

/**
 * Settings › AI access: your apps and keys from the API, the key dialog, and revoking (asked first). A row being
 * revoked folds away once the API has said yes; a new key's row glows once.
 */
export function useAiAccess(spaces: SpaceSummary[], ask: (r: Revoking) => void, phone = false) {
  const keys = useQuery(keysQuery);
  const apps = useQuery(appsQuery);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [glow, setGlow] = useState<string | null>(null);
  useEffect(() => {
    if (!glow) return;
    const t = setTimeout(() => setGlow(null), GLOW_MS);
    return () => clearTimeout(t);
  }, [glow]);
  const now = new Date();
  const url = apps.data?.url ?? '';

  const access: AiAccessData = {
    url,
    loading: keys.isPending || apps.isPending,
    error: keys.isError || apps.isError,
    apps: apps.data?.apps.map((x) => ({
      ...grantOf(x, x.clientId, spaces, now),
      verified: x.verified,
      icon: x.icon,
      leaving: leaving === x.clientId,
    })),
    keys: keys.data?.keys.map((x) => ({
      ...grantOf(x, x.id, spaces, now),
      state: x.state === 'expired' ? 'expired' : 'ok',
      expires: x.expiresAt ? dayWords(x.expiresAt) : undefined,
      highlight: glow === x.id,
      leaving: leaving === x.id,
    })),
  };

  /** Takes the row out once it has folded. */
  const fold = (id: string, drop: () => void) => {
    setLeaving(id);
    setTimeout(() => {
      drop();
      setLeaving(null);
    }, FOLD_MS);
  };

  const onRevoke = (x: AiGrant, kind: 'app' | 'key') => {
    if (kind === 'app')
      return ask({
        ask: disconnectAppAsk(x.name),
        run: async () => {
          try {
            await api.delete(`/api/apps/${encodeURIComponent(x.id)}`);
          } catch (err) {
            if (!(err instanceof ApiError && err.status === 404))
              throw new Error('Couldn’t disconnect it. Check your connection and try again.', { cause: err });
          }
          fold(x.id, () =>
            queryClient.setQueryData<AiAppsResponse>(AI_APPS, (d) =>
              d ? { ...d, apps: d.apps.filter((a) => a.clientId !== x.id) } : d,
            ),
          );
        },
      });
    const row = keys.data?.keys.find((k) => k.id === x.id);
    const expired = row?.state === 'expired';
    const go = async () => {
      try {
        await api.delete(`/api/keys/${x.id}`);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404))
          throw new Error(
            expired
              ? 'Couldn’t remove the key. Check your connection and try again.'
              : 'Couldn’t revoke the key. Check your connection and try again. It still works until it’s revoked.',
            { cause: err },
          );
      }
      fold(x.id, () =>
        queryClient.setQueryData<AiKeysResponse>(AI_KEYS, (d) =>
          d ? { keys: d.keys.filter((k) => k.id !== x.id) } : d,
        ),
      );
    };
    // An expired key no longer works: removing it is tidying, nothing to ask.
    if (expired) return void go().catch(() => {});
    ask({ ask: revokeKeyAsk(x.name, row?.start ?? ''), run: go });
  };

  const onCreate = async (draft: AiDraft): Promise<{ key: string }> => {
    try {
      const out = await api.post<AiNewKeyResponse>('/api/keys', draft);
      queryClient.setQueryData<AiKeysResponse>(AI_KEYS, (d) => ({ keys: [out.row, ...(d?.keys ?? [])] }));
      setGlow(out.row.id);
      return { key: out.key };
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : KEY_FAILED_WORDS, { cause: err });
    }
  };

  const dialog = (
    <ApiKeyDialog
      open={creating}
      variant={phone ? 'sheet' : 'dialog'}
      onClose={() => setCreating(false)}
      spaces={spaces.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color ?? undefined,
        personal: s.kind === 'personal',
      }))}
      taken={keys.data?.keys.map((k) => k.name)}
      url={url}
      onCreate={onCreate}
    />
  );

  return {
    access,
    dialog,
    onCreate: () => setCreating(true),
    onRevoke,
    onRetry: () => {
      void keys.refetch();
      void apps.refetch();
    },
  };
}
