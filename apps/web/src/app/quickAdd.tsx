import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  addedWords,
  initialsOf,
  mondayOf,
  pagePlannedDay,
  searchWhere,
  sentToWords,
  spaceInitials,
  weekDays,
  type IsoDate,
  type SearchHit,
  type SearchResponse,
} from '@tudu/core';
import {
  QuickAdd,
  showToast,
  type PickPerson,
  type QuickAddResult,
  type QuickAddSend,
  type SimilarItem,
} from '@tudu/ui';
import { useEffect, useRef, useState } from 'react';
import type { MeResponse } from '@tudu/client';
import {
  closeQuickAdd,
  flashTask,
  openQuickAdd,
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
import { editProjects, editProjectsHref } from './editProjects';
import { goToTask } from './search';
import { api } from './session';
import { spacePath, useSpace } from './space';
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

type SendTo = { spaceId: string; toId: string | null };
type LineSpace = MeResponse['spaces'][number];

/** The people in a team space, for the "for" chip (only read while Quick Add is open). */
export function useSpacePeople(me: MeResponse, target: LineSpace, open: boolean): PickPerson[] {
  const members = useQuery({
    ...taskStore.membersQuery(target.id),
    enabled: open && target.kind === 'team',
  }).data;
  return (members?.members ?? []).map((m) => ({
    id: m.id,
    name: m.name || m.email,
    email: m.email,
    initials: initialsOf(m.name, m.email),
    color: m.color ?? undefined,
    you: m.id === me.user.id,
  }));
}

/** Quick Add's top line, "In Northwind for Me": every space you are in and, in a team space, who it is for. */
export function sendLine(
  me: MeResponse,
  target: LineSpace,
  people: PickPerson[],
  to: PickPerson | null,
  setSendTo: (next: SendTo | ((s: SendTo) => SendTo)) => void,
): QuickAddSend {
  return {
    spaces: me.spaces.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? undefined,
      personal: s.kind === 'personal',
      initials: spaceInitials(s.name),
    })),
    spaceId: target.id,
    onSpace: (id) => setSendTo({ spaceId: id, toId: null }),
    people,
    to,
    onTo: (p) => setSendTo((s) => ({ ...s, toId: p?.id ?? null })),
    me: {
      name: me.user.name || me.user.email,
      initials: initialsOf(me.user.name, me.user.email),
      color: me.user.color ?? undefined,
    },
    canSend: target.kind === 'team',
  };
}

/** Quick Add over the app: the bar on the desk and tablets, the sheet above the keyboard on phones. */
export function QuickAddHost({ me }: { me: MeResponse }) {
  const vp = useViewport();
  const open = useQuickAddOpen();
  const space = useSpace();
  const seed = useQuickAddSeed();
  // The top line: which space it goes to (this one unless the seed says otherwise), and for whom (you by default).
  const [sendTo, setSendTo] = useState<SendTo>({
    spaceId: space.id,
    toId: null,
  });
  const [seenSeed, setSeenSeed] = useState(seed?.nonce ?? 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && !(seed && seed.nonce !== seenSeed)) setSendTo({ spaceId: space.id, toId: null });
  }
  if (seed && seed.nonce !== seenSeed) {
    setSeenSeed(seed.nonce);
    if (seed.toId !== undefined || seed.spaceId !== undefined)
      setSendTo({ spaceId: seed.spaceId ?? space.id, toId: seed.toId ?? null });
  }
  const target = me.spaces.find((s) => s.id === sendTo.spaceId) ?? space;
  const people = useSpacePeople(me, target, open);
  const to = sendTo.toId ? (people.find((p) => p.id === sendTo.toId) ?? null) : null;
  const a = useQuickAddActions(target.id);
  const keyboard = useKeyboardHeight(vp === 'phone' && open);
  const lastId = useRef<string | null>(null);
  const day2: IsoDate | null = useSecondDay();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  // Tasks that read like the title, from the same search as the panel's, so "Looks like a task you have" can open one.
  const alike = useRef(new Map<string, SearchHit>());
  const similar = async (title: string): Promise<SimilarItem[]> => {
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
        setTimeout(() => goToTask(h, a.today, (to) => void navigate({ href: to }), space.slug), 200);
      }}
      variant={vp === 'phone' ? 'sheet' : 'bar'}
      today={a.today}
      planned={a.shown}
      projects={a.projects}
      keyboard={keyboard}
      offline={!a.online}
      // The top line is always there: "In Personal for Me" with plain chips until there is a team space to pick.
      send={sendLine(me, target, people, to, setSendTo)}
      onClose={closeQuickAdd}
      onNewProject={a.newProject}
      onEditProjects={() => {
        closeQuickAdd();
        const here = { slug: space.slug, pathname: loc.pathname, searchStr: loc.searchStr };
        editProjects(
          (href) => void navigate({ href }),
          editProjectsHref(target.slug, here, vp === 'phone'),
          // On the desk and tablets Quick Add comes back with its draft when Settings closes.
          vp === 'phone' ? undefined : () => openQuickAdd(),
        );
      }}
      onUpload={a.upload}
      onSave={(t) => {
        if (t.toId) {
          lastId.current = taskStore.sendRequest(target.id, t.toId, {
            title: t.title,
            note: t.note,
            askedDay: t.planned,
            due: t.due,
            projectId: t.projectId,
            attachments: t.attachments,
          });
          return;
        }
        lastId.current = a.save(t);
      }}
      onAdded={(t) => {
        const id = lastId.current;
        if (!id) return;
        if (t.toId) {
          // Sent: it waits in their Inbox, and in your Sent, in that space.
          const first = (to?.name ?? 'them').trim().split(/\s+/)[0]!;
          showToast(sentToWords(first, target.id !== space.id ? target.name : undefined), {
            action: 'Show',
            onAction: () => void navigate({ href: `${spacePath(target.slug, 'inbox')}?view=sent` }),
          });
          return;
        }
        if (target.id !== space.id) {
          showToast(`${addedWords(t.planned, a.today)} in ${target.name}`, {
            action: 'Show',
            onAction: () => void navigate({ href: spacePath(target.slug, t.planned ? 'today' : 'backlog') }),
          });
          return;
        }
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
              void navigate({ href: `/${space.slug}` });
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
              void navigate({ href: `/${space.slug}/backlog` });
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
