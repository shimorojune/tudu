import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { addedWords, mondayOf, pagePlannedDay, searchWhere, weekDays, type IsoDate, type SearchHit, type SearchResponse } from '@tudu/core';
import { QuickAdd, showToast, type QuickAddResult, type SimilarItem } from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import type { MeResponse } from '@tudu/client';
import {
  closeQuickAdd,
  flashTask,
  showDay,
  showWeek,
  useDayView,
  usePage,
  useQuickAddOpen,
  useQuickAddSeed,
  useSecondDay,
  useShownDay,
  useShownWeek,
} from './dayView';
import { goToTask } from './search';
import { api } from './session';
import { taskStore, useOnline } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';

/** Plain words from the note line become paragraphs. */
export function noteToHtml(note: string): string {
  const t = note.trim();
  if (!t) return '';
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t
    .split(/\n{2,}/)
    .map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The phone keyboard's height, from the visual viewport, so the sheet can sit on it. */
export function useKeyboardHeight(on: boolean): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!on || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const read = () => setH(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    read();
    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, [on]);
  return on ? h : 0;
}

/** Write the task through the store and say where it went. Shared by the bar over the app and the floating page. */
export function useQuickAddActions(spaceId: string | undefined) {
  const { today } = useWorkingDay();
  const page = usePage();
  const monday = useShownWeek() ?? mondayOf(today);
  const shownDay = useShownDay() ?? today;
  // On the week page a new task lands on the first day of the shown week that is not gone by; in the Backlog, nowhere.
  const shown = pagePlannedDay(page, { shownDay, monday, today });
  const view = useDayView();
  const projects = useQuery({ ...taskStore.projectsQuery(spaceId ?? ''), enabled: !!spaceId }).data ?? [];
  const online = useOnline();
  const save = (t: QuickAddResult) => {
    if (!spaceId) throw new Error('no space');
    return taskStore.create(spaceId, t.planned, t.title, undefined, {
      due: t.due,
      projectId: t.projectId,
      notes: noteToHtml(t.note),
      attachments: t.attachments,
      source: 'quick-add',
    });
  };
  return {
    today,
    shown,
    view,
    page,
    monday,
    projects,
    online,
    save,
    newProject: (name: string) => (spaceId ? taskStore.createProject(spaceId, name) : undefined),
    upload: (file: File, onProgress: (ratio: number) => void) =>
      spaceId ? taskStore.upload(spaceId, file, null, onProgress) : Promise.reject(new Error('no space')),
  };
}

/** Quick Add over the app: the bar on the desk and tablets, the sheet above the keyboard on phones. */
export function QuickAddHost({ me }: { me: MeResponse }) {
  const vp = useViewport();
  const open = useQuickAddOpen();
  const space = me.spaces.find((s) => s.kind === 'personal') ?? me.spaces[0];
  const a = useQuickAddActions(space?.id);
  const keyboard = useKeyboardHeight(vp === 'phone' && open);
  const lastId = useRef<string | null>(null);
  const day2: IsoDate | null = useSecondDay();
  const navigate = useNavigate();
  const seed = useQuickAddSeed();
  // Tasks that read like the title, from the same search as the panel's, so "Looks like a task you have" can open one.
  const alike = useRef(new Map<string, SearchHit>());
  const similar = async (title: string): Promise<SimilarItem[]> => {
    if (!space) return [];
    const r = await api.get<SearchResponse>(
      `/api/spaces/${space.id}/search?for=lookalike&q=${encodeURIComponent(title)}`,
    );
    for (const h of r.hits) alike.current.set(h.id, h);
    return r.hits.map((h) => ({ key: h.id, title: h.title, where: searchWhere(h.day, h.done, a.today) }));
  };
  return (
    <QuickAdd
      open={open}
      seed={seed}
      similar={similar}
      onOpenSimilar={(it) => {
        const h = alike.current.get(it.key);
        if (!h) return;
        closeQuickAdd();
        setTimeout(() => goToTask(h, a.today, (to) => void navigate({ to })), 200);
      }}
      variant={vp === 'phone' ? 'sheet' : 'bar'}
      today={a.today}
      planned={a.shown}
      projects={a.projects}
      keyboard={keyboard}
      offline={!a.online}
      onClose={closeQuickAdd}
      onNewProject={a.newProject}
      onUpload={a.upload}
      onSave={(t) => {
        lastId.current = a.save(t);
      }}
      onAdded={(t) => {
        const id = lastId.current;
        if (!id) return;
        if (a.page === 'week') {
          // In view when it landed in the shown week's tiles or the Backlog tile; else the toast turns the week.
          const here = t.planned === null || weekDays(a.monday).includes(t.planned);
          if (here) {
            flashTask(id, t.planned);
            return;
          }
          showToast(addedWords(t.planned, a.today), {
            action: 'Show',
            onAction: () => {
              showWeek(mondayOf(t.planned!), mondayOf(a.today));
              setTimeout(() => flashTask(id, t.planned), 60);
            },
          });
          return;
        }
        if (a.page === 'backlog') {
          // In view when it has no day; a task given a day toasts, and Show turns to Today on it.
          if (t.planned === null) {
            flashTask(id, null);
            return;
          }
          showToast(addedWords(t.planned, a.today), {
            action: 'Show',
            onAction: () => {
              showDay(t.planned, a.today);
              void navigate({ to: '/' });
              setTimeout(() => flashTask(id, t.planned), 60);
            },
          });
          return;
        }
        const here = t.planned === a.shown || (a.view === 'two' && vp === 'desktop' && t.planned === day2);
        if (here) {
          flashTask(id, t.planned);
          return;
        }
        if (!t.planned) {
          showToast(addedWords(null, a.today), {
            action: 'Show',
            onAction: () => {
              void navigate({ to: '/backlog' });
              setTimeout(() => flashTask(id, null), 60);
            },
          });
          return;
        }
        showToast(addedWords(t.planned, a.today), {
          action: 'Show',
          onAction: () => {
            showDay(t.planned, a.today);
            setTimeout(() => flashTask(id, t.planned), 60);
          },
        });
      }}
    />
  );
}
