import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { searchWhere, type Project, type SearchHit, type SearchResponse } from '@tudu/core';
import { SearchPanel, SP_LEAVE_MS, SP_LEAVE_PHONE_MS, type SearchItem } from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import type { MeResponse } from '@tudu/client';
import { closeSearch, openQuickAdd, useSearchOpen } from './dayView';
import { addRecentTask, addSearch, clearSearches, goToTask, useRecentTasks, useSearches } from './search';
import { api } from './session';
import { useSpace } from './space';
import { taskStore } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';

/** The words are sent this long after the last key. */
export const SEARCH_AFTER_MS = 80;

/** A hit as the panel's row; `space` names where it lives when that is not the space you are looking at. */
export function toSearchItem(
  h: SearchHit,
  today: string,
  projects: Project[],
  space: { name: string; color: string | null } | null = null,
): SearchItem {
  const project = h.projectId ? projects.find((p) => p.id === h.projectId) : undefined;
  return {
    key: h.id,
    id: h.ref,
    title: h.title,
    done: h.done,
    where: searchWhere(h.day, h.done, today),
    project: project ? { name: project.name, color: project.color } : null,
    jira: h.jira,
    snippet: h.snippet,
    space,
  };
}

/** The space a close match carries, for its row, when it is not the one you are in. */
export function spaceOfHit(h: SearchHit, spaces: MeResponse['spaces'], hereId: string) {
  if (!h.spaceId || h.spaceId === hereId) return null;
  const s = spaces.find((x) => x.id === h.spaceId);
  return s ? { name: s.name, color: s.color } : null;
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
  const space = useSpace();
  const spaceId = space.id;
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

  // Close matches, by meaning, from every space you are in: asked by the panel a moment after the words settle,
  // without the word hits it already lists. The hits are kept so a pick can go to them.
  const similarHits = useRef(new Map<string, SearchHit>());
  const wordHits = useRef<{ query: string; ids: string[] }>({ query: '', ids: [] });
  useEffect(() => {
    wordHits.current = { query: hits.data?.query ?? '', ids: (hits.data?.hits ?? []).map((h) => h.id) };
  }, [hits.data]);
  const similar = async (q: string): Promise<SearchItem[]> => {
    // The word hits for these very words are left out; if they are not in yet, the panel folds any overlap.
    const exclude = wordHits.current.query === q ? wordHits.current.ids.join(',') : '';
    const r = await api.get<SearchResponse>(
      `/api/search/meaning?q=${encodeURIComponent(q)}${exclude ? `&exclude=${exclude}` : ''}`,
    );
    for (const h of r.hits) similarHits.current.set(h.id, h);
    return r.hits.map((h) => toSearchItem(h, today, projects, spaceOfHit(h, me.spaces, spaceId)));
  };

  const pick = (item: SearchItem) => {
    const h =
      [...(hits.data?.hits ?? []), ...(recent.data ?? [])].find((x) => x.id === item.key) ??
      similarHits.current.get(item.key);
    if (!h) return;
    closeSearch();
    // A close match from another space: the page turns to that space, and the task joins its recently opened.
    const target = h.spaceId && h.spaceId !== spaceId ? me.spaces.find((x) => x.id === h.spaceId) : null;
    addRecentTask(target ? target.id : spaceId, h.id);
    setTimeout(
      () => goToTask(h, today, (to) => void navigate({ href: to }), target ? target.slug : space.slug),
      leaveMs + 20,
    );
  };
  const create = (title: string) => {
    closeSearch();
    setTimeout(() => openQuickAdd({ title }), leaveMs + 20);
  };
  if (!me) return null;
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
      similar={similar}
      onSearched={(words) => addSearch(spaceId, words)}
      onPick={pick}
      onCreate={create}
      onClose={closeSearch}
    />
  );
}
