import { useQueries, useQuery } from '@tanstack/react-query';
import type { MeResponse } from '@tudu/client';
import {
  addDays,
  dayHeading,
  gatherToday,
  menuBarEmptyLines,
  spaceInitials,
  type IsoDate,
  type SpaceSummary,
  type Task,
} from '@tudu/core';
import { MenuBarSheet, type MenuBarGroupItem, type MenuBarRowItem, type MenuBarSheetProps } from '@tudu/ui';
import { useEffect, useState } from 'react';
import { useAppInfo } from '../../app/DesktopHost';
import { desktop, UPDATES_GO, type DesktopBridge } from '../../app/desktop';
import { useLiveEvents } from '../../app/live';
import { meQuery, refreshMe } from '../../app/session';
import { spacePath } from '../../app/space';
import { taskStore, useOnline } from '../../app/tasks';
import { restartToUpdate, useUpdateStatus } from '../../app/updates';
import { useWorkingDay, WorkingDayProvider } from '../../app/workingDay';
import { toItem } from '../today/TodayPage';
import './menubar.css';

/** In the app the sheet starts hidden and the tick's click shows it; anywhere else (a test, a tab) it is on show. */
const startsShown = (): boolean => !window.__TAURI_INTERNALS__;

/** Somewhere to go when there is no app around the page: the same thing, in this tab. */
function go(path: string): void {
  window.location.assign(path);
}

/** Yours and still open: what the empty sheet counts for tomorrow and the Backlog. */
const waiting = (tasks: Task[] | undefined, meId: string) =>
  (tasks ?? []).filter((t) => !t.done && (t.ownerId === null || t.ownerId === meId)).length;

/** A task as the sheet's row shows it: the same byline words as its row on Today. */
export function menuBarRow(t: Task, today: IsoDate, projects: Parameters<typeof toItem>[2]): MenuBarRowItem {
  const i = toItem(t, today, projects);
  return {
    key: t.id,
    title: t.title,
    done: t.done,
    carried: i.carried,
    due: i.due,
    project: i.project,
    jira: i.jira,
  };
}

/**
 * Today from the menu bar: the page the macOS app's `menubar` window holds, under the tick. Every space's today
 * (only your own tasks), ticked off right there into the same outbox as the desk's. It keeps its own live stream
 * while it is on show.
 */
export function MenuBarPage({ me: first }: { me: MeResponse | null }) {
  const app = desktop();
  const { data } = useQuery({ ...meQuery, initialData: first });
  const me = data ?? null;
  const info = useAppInfo();
  const [shown, setShown] = useState(startsShown);

  useEffect(() => {
    if (!app) return;
    const on = app.on('menubar:shown', () => {
      setShown(true);
      void refreshMe();
      taskStore.refreshAll();
    });
    const off = app.on('menubar:hidden', () => setShown(false));
    return () => {
      on();
      off();
    };
  }, [app]);
  useLiveEvents(!!me && shown);

  // Esc puts the sheet away, unless something in it (the ⋯ menu) took the key first.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) app?.hideMenubar();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [app]);

  const { status } = useUpdateStatus(app);
  const name = info?.name ?? 'Tudu';
  // ⋯'s first item, only from an app that can say where its updates stand.
  const update: MenuBarSheetProps['update'] =
    app && status
      ? {
          ready: status.ready?.version,
          // The check starts here; the desk shows it in Settings › This Mac.
          onCheck: () => {
            void app.checkUpdate(true).catch(() => {});
            app.showMain(UPDATES_GO);
          },
          onRestart: () => void restartToUpdate(app, name).catch(() => {}),
        }
      : undefined;
  const common = {
    appName: name,
    onOpenApp: () => (app ? app.showMain() : go('/')),
    onQuit: () => app?.quit(),
    update,
  };
  return (
    <div
      className="app-menubar"
      // The clear part of the window around the sheet: a click there puts it away.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) app?.hideMenubar();
      }}
    >
      {me ? (
        <WorkingDayProvider>
          <Today
            me={me}
            app={app}
            shortcut={info?.shortcut}
            noteShortcut={info?.noteShortcut}
            {...common}
          />
        </WorkingDayProvider>
      ) : (
        <MenuBarSheet state="signed-out" {...common} />
      )}
    </div>
  );
}

function Today({
  me,
  app,
  shortcut,
  noteShortcut,
  appName,
  onOpenApp,
  onQuit,
  update,
}: {
  me: MeResponse;
  app: DesktopBridge | null;
  shortcut?: string;
  noteShortcut?: string;
  appName: string;
  onOpenApp: () => void;
  onQuit: () => void;
  update?: MenuBarSheetProps['update'];
}) {
  const { today } = useWorkingDay();
  const online = useOnline();
  const spaces = me.spaces;
  const days = useQueries({ queries: spaces.map((s) => taskStore.dayQuery(s.id, today, today)) });
  const projects = useQueries({ queries: spaces.map((s) => taskStore.projectsQuery(s.id)) });
  const read: Record<string, Task[] | undefined> = {};
  spaces.forEach((s, i) => (read[s.id] = days[i]?.data?.tasks));
  const gathered = gatherToday(spaces, read, me.user.id);
  const ready = days.every((d) => d.data !== undefined || d.isError);
  const empty = ready && gathered.length === 0;

  const tomorrow = useQueries({
    queries: empty ? spaces.map((s) => taskStore.dayQuery(s.id, addDays(today, 1))) : [],
  });
  const backlog = useQueries({ queries: empty ? spaces.map((s) => taskStore.backlogQuery(s.id)) : [] });

  const projectsOf = (s: SpaceSummary) => projects[spaces.indexOf(s)]?.data ?? [];
  const groups: MenuBarGroupItem[] = gathered.map((g) => ({
    key: g.space.id,
    name: g.space.name,
    space: {
      name: g.space.name,
      color: g.space.color ?? undefined,
      personal: g.space.kind === 'personal',
      initials: spaceInitials(g.space.name),
    },
    rows: g.tasks.map((t) => menuBarRow(t, today, projectsOf(g.space))),
  }));

  const open = (row: MenuBarRowItem) => {
    const g = gathered.find((x) => x.tasks.some((t) => t.id === row.key));
    const task = g?.tasks.find((t) => t.id === row.key);
    if (!g || !task) return;
    const path = `${spacePath(g.space.slug, 'today')}?task=${encodeURIComponent(task.ref ?? task.id)}`;
    if (app) app.openTask(path);
    else go(path);
  };

  if (!ready) return null;
  return (
    <MenuBarSheet
      state={empty ? 'empty' : 'day'}
      heading={dayHeading(today, today)}
      groups={groups}
      emptyLines={menuBarEmptyLines(
        tomorrow.reduce((n, q) => n + waiting(q.data?.tasks, me.user.id), 0),
        backlog.reduce((n, q) => n + waiting(q.data?.tasks, me.user.id), 0),
      )}
      offline={!online}
      shortcut={shortcut}
      noteShortcut={noteShortcut}
      appName={appName}
      onToggle={(row, done) => taskStore.cross(row.key, done)}
      onOpen={open}
      onNew={() => app?.summon()}
      // The note window on a blank note, over whatever app you are in; the sheet hides first, the desk stays put.
      // An app too old to have the window: the Notebook on the desk.
      onNewNote={app ? () => void app.openNote(null).catch(() => app.showMain('/notebook')) : undefined}
      onOpenApp={onOpenApp}
      onFeedback={() => app?.feedback()}
      onQuit={onQuit}
      update={update}
    />
  );
}
