import { createApi, createAuthClientFor, ApiError, type MeResponse } from '@tudu/client';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { API_URL } from './config';

export const api = createApi({ baseUrl: API_URL });
export const authClient = createAuthClientFor(API_URL);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    },
  },
});

/** Who is signed in and their spaces; null when nobody is. */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api.get<MeResponse>('/api/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
});

/** Ask the server again who is signed in (after sign in). */
export function refreshMe(): Promise<MeResponse | null> {
  return queryClient.fetchQuery({ ...meQuery, staleTime: 0 });
}

export async function signOut(): Promise<void> {
  // Unsaved changes get a moment to land; whatever is left belongs to this person and goes with them.
  const { taskStore } = await import('./tasks');
  await taskStore.clear();
  await authClient.signOut();
  queryClient.setQueryData(meQuery.queryKey, null);
  await queryClient.invalidateQueries();
}

/** Initials for an avatar: "Rohit Raj" gives RR, "rohit@x.y" gives R. */
export function initialsOf(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1 && words[0]!.length) return words[0]!.slice(0, 2).toUpperCase();
  return email.slice(0, 1).toUpperCase();
}
