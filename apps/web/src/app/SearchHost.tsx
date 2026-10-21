import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { searchWhere, type Project, type SearchHit, type SearchResponse } from '@tudu/core';
import { SearchPanel, SP_LEAVE_MS, SP_LEAVE_PHONE_MS, type SearchItem } from '@tudu/ui';
import { useEffect, useState } from 'react';
import type { MeResponse } from '@tudu/client';
import { closeSearch, openQuickAdd, useSearchOpen } from './dayView';
import { addRecentTask, addSearch, clearSearches, goToTask, useRecentTasks, useSearches } from './search';
import { api } from './session';
import { taskStore } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';

/** The words are sent this long after the last key. */
export const SEARCH_AFTER_MS = 80;

/** A hit as the panel's row. */
export function toSearchItem(h: SearchHit, today: string, projects: Project[]): SearchItem {
  const project = h.projectId ? projects.find((p) => p.id === h.projectId) : undefined;
  return {
    key: h.id,
    id: h.ref,
    title: h.title,
    done: h.done,
    where: searchWhere(h.day, h.done, today),
    project: project ? { name: project.name, color: project.color } : null,
    snippet: h.snippet,
  };
}

/** The words a moment after they stop changing. */
function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return value ? settled : '';
}

/**
 * Search over the app: the panel on the desk and tablets, the sheet on phones. The server answers every key
 * (a moment after it); the rows stay while the next answer comes. A pick turns the page to the task and glows
 * its row; Create opens Quick Add with the words.
 */
export function SearchHost({ me }: { me: MeResponse }) {
  const vp = useViewport();
  const open = useSearchOpen();
  const { today } = useWorkingDay();
  const navigate = useNavigate();
  const space = me.spaces.find((s) => s.kind === 'personal') ?? me.spaces[0];
  const spaceId = space?.id ?? '';
  const [q, setQ] = useState('');
  const qd = useSettled(q, SEARCH_AFTER_MS);
  const projects = useQuery({ ...taskStore.projectsQuery(spaceId), enabled: !!spaceId && open }).data ?? [];
  const hits = useQuery({
    queryKey: ['search', spaceId, qd, today],
    queryFn: async () => {
      const r = await api.get<SearchResponse>(
        `/api/spaces/${spaceId}/search?q=${encodeURIComponent(qd)}&today=${today}`,
      );
      return { query: qd, hits: r.hits };
    },
    enabled: !!spaceId && !!qd,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    // Offline, the search fails at once (the quiet line) rather than waiting for the connection.
    networkMode: 'always',
  });
  const recentIds = useRecentTasks(spaceId);
  const recent = useQuery({
    queryKey: ['search-recent', spaceId, recentIds.join(',')],
    queryFn: async () => {
      const r = await api.get<SearchResponse>(
        `/api/spaces/${spaceId}/search?ids=${encodeURIComponent(recentIds.join(','))}`,
      );
      return r.hits;
    },
    enabled: !!spaceId && open && recentIds.length > 0,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
  });
  const history = useSearches(spaceId);
  const leaveMs = vp === 'phone' ? SP_LEAVE_PHONE_MS : SP_LEAVE_MS;

  const pick = (item: SearchItem) => {
    const h = [...(hits.data?.hits ?? []), ...(recent.data ?? [])].find((x) => x.id === item.key);
    if (!h) return;
    closeSearch();
    addRecentTask(spaceId, h.id);
    setTimeout(() => goToTask(h, today, (to) => void navigate({ to })), leaveMs + 20);
  };
  const create = (title: string) => {
    closeSearch();
    setTimeout(() => openQuickAdd({ title }), leaveMs + 20);
  };
  if (!space) return null;
  return (
    <SearchPanel
      open={open}
      variant={vp === 'phone' ? 'sheet' : 'dialog'}
      results={
        hits.data && !hits.isError && q.trim().toLowerCase()
          ? {
              query: hits.data.query.toLowerCase(),
              hits: hits.data.hits.map((h) => toSearchItem(h, today, projects)),
            }
          : null
      }
      loading={!!qd && hits.isPending && !hits.data}
      error={hits.isError && !hits.isFetching}
      onRetry={() => void hits.refetch()}
      recent={recentIds.length && recent.data ? recent.data.map((h) => toSearchItem(h, today, projects)) : []}
      history={history}
      onClearHistory={() => clearSearches(spaceId)}
      onQuery={setQ}
      onSearched={(words) => addSearch(spaceId, words)}
      onPick={pick}
      onCreate={create}
      onClose={closeSearch}
    />
  );
}
