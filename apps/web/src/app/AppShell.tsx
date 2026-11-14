import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  addDays,
  ALL_SLUG,
  hasAllSpaces,
  inboxBadge,
  matchAppShortcut,
  membersWords,
  spaceForNumber,
  spaceInitials,
  switcherOrder,
  weekdayName,
  type SpaceSummary,
} from '@tudu/core';
import {
  Avatar,
  BottomTabs,
  Fab,
  Icon,
  ScrambledPill,
  Sidebar,
  SpaceSwitch,
  TopBar,
  useTheme,
  type SidebarItem,
  type SwitchSpace,
} from '@tudu/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { MeResponse } from '@tudu/client';
import { cx } from '@tudu/ui';
import {
  openCreateSpace,
  openQuickAdd,
  openSearch,
  setDayView,
  showDay,
  useDayView,
  useSearchOpen,
  useShownDay,
} from './dayView';
import { FeedbackHost, openFeedback, useFeedback } from './feedback';
import { GettingStartedHost } from './firstRun';
import { SearchHost } from './SearchHost';
import { AppsHost, JiraConnectHost, JiraHost } from './JiraHost';
import { jiraParam, openApps, useJira, useJiraCountOnFocus, useJiraFresh, withJira } from './jira';
import { QuickAddHost } from './quickAdd';
import { initialsOf, photoSrc, signOut } from './session';
import { SettingsHost, settingsHref } from './settings';
import { inApp } from './desktop';
import { inboxTotal, useUpdate } from './updates';
import { useAllMarks, useAllScope } from './allSpaces';
import { ALL_VIEWS, INBOX_PATH, NOTEBOOK_PATH, pagePath, switchPath, viewOf, type View } from './space';
import { NoteWindowHost } from './NoteWindowHost';
import { CreateSpaceHost, MembersHost } from './spaces';
import { taskStore } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';
import { spaceHint, useAppShortcuts, type AppBindings } from './shortcuts';
import type { KeyPlatform } from '@tudu/core';
import './shell.css';

const VIEWS: Array<{
  value: View;
  label: string;
  icon: 'today' | 'week' | 'backlog' | 'team';
  /** Team spaces only. */
  team?: boolean;
}> = [
  { value: 'today', label: 'Today', icon: 'today' },
  { value: 'week', label: 'Week', icon: 'week' },
  { value: 'backlog', label: 'Backlog', icon: 'backlog' },
  { value: 'people', label: 'People', icon: 'team', team: true },
];

/**
 * The sidebar's views: the space's own pages. The Inbox is across spaces, so it opens from the top bar. All spaces
 * has Today, Week and the Backlog only.
 */
export function sideItems(team: boolean, all = false): SidebarItem[] {
  return VIEWS.filter((v) => (all ? ALL_VIEWS.includes(v.value) : team || !v.team)).map((v) => ({
    value: v.value,
    label: v.label,
    icon: v.icon,
  }));
}

/** How long the page fades out before the next space's page comes in. */
export const PAGE_OUT_MS = 110;

const SIDEBAR_KEY = 'tudu.sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/**
 * Which of the phone's tabs is lit: Search while its sheet is up, More for the views that live under it, else the
 * page's own tab.
 */
export function phoneTab(at: { view: View; onToday: boolean; searchOpen: boolean; jira?: boolean }): string {
  if (at.searchOpen) return 'search';
  // Jira's page is its tab once it is connected; before, it is the form under More › Apps.
  if (at.view === 'jira') return at.jira ? 'jira' : 'more';
  if (
    at.view === 'apps' ||
    at.view === 'notebook' ||
    at.view === 'backlog' ||
    at.view === 'people' ||
    at.view === 'more' ||
    at.view === 'settings'
  )
    return 'more';
  return at.onToday ? 'today' : at.view;
}

/**
 * The spaces as the switcher lists them: All spaces first (with two spaces or more, and no count of its own), then
 * Personal, each with its quiet line and its own Inbox count.
 */
export function switchSpaces(
  spaces: SpaceSummary[],
  keys?: { app: AppBindings; platform: KeyPlatform },
): SwitchSpace[] {
  const hint = (n: number) => (keys ? (spaceHint(keys.app, keys.platform, n) ?? {}) : {});
  const all: SwitchSpace[] = hasAllSpaces(spaces)
    ? [{ id: ALL_SLUG, all: true, name: 'All spaces', sub: 'Everything that’s yours', ...hint(0) }]
    : [];
  return [
    ...all,
    ...switcherOrder(spaces).map((s, i) => ({
      id: s.id,
      name: s.name,
      color: s.color ?? undefined,
      personal: s.kind === 'personal',
      initials: spaceInitials(s.name),
      sub: membersWords(s.members),
      count: inboxBadge(s.inbox) || undefined,
      ...hint(i + 1),
    })),
  ];
}

/**
 * A key press, as the space keys see it: the space it goes to, picked through the open list when there is one (so
 * its tick draws in as a click's would). Under any other layer, or on a repeat, nothing; a match is never typed.
 */
export function spaceKey(
  e: KeyboardEvent,
  at: {
    keys: { app: AppBindings };
    spaceList: SwitchSpace[];
    here: string;
    pickSpace: (s: SwitchSpace) => void;
  },
  doc: Document = document,
): void {
  if (e.repeat || e.defaultPrevented) return;
  const m = matchAppShortcut(e, at.keys.app);
  if (!m || layerOpen(doc)) return;
  e.preventDefault();
  e.stopPropagation();
  const target = spaceForNumber(at.spaceList, m.to === 'all' ? 0 : m.n);
  if (!target || target.id === at.here) return;
  const rows = doc.querySelectorAll<HTMLElement>('.tp-sswl [role="menuitemradio"]');
  const row = rows[at.spaceList.indexOf(target)];
  if (row) row.click();
  else at.pickSpace(target);
}

/** A dialog, Quick Add, Search, Settings, a menu or a panel is up (the space list itself aside). */
export function layerOpen(doc: Document = document): boolean {
  const layers = doc.querySelectorAll(
    '[role="dialog"], [role="alertdialog"], [role="menu"]:not(.tp-sswl), [role="listbox"]',
  );
  return Array.from(layers).some((el) => el.getClientRects().length > 0);
}

/**
 * The app around the page: sidebar, top bar and the scrolling column on the desk; the rail on tablets; tabs on
 * phones. The space's name at the top opens the list of spaces; switching keeps the view and fades the page in.
 */
export function AppShell({
  me,
  space,
  all = false,
  children,
}: {
  me: MeResponse;
  space: SpaceSummary;
  /** All spaces: its own sidebar (Today, Week, Backlog), no Jira, and the dots of every space. */
  all?: boolean;
  children: ReactNode;
}) {
  const vp = useViewport();
  const navigate = useNavigate();
  const loc = useRouterState({ select: (s) => s.location });
  const path = loc.pathname;
  const { choice, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open');
    } catch {
      /* fine */
    }
  }, [collapsed]);

  const { today } = useWorkingDay();
  const shownParam = useShownDay();
  const view = useDayView();
  const days = [1, 2, 3, 4, 5].map((n) => addDays(today, n));
  // The sidebar's week: a dot for each day that has tasks.
  const single = useQuery({
    ...taskStore.marksQuery(space.id, days[0]!, days[4]!),
    enabled: vp === 'desktop' && !all,
  }).data;
  const scope = useAllScope();
  const allMarks = useAllMarks(all && vp === 'desktop' ? scope : null, days[0]!, days[4]!);
  const marks = all ? allMarks : single;
  const week = days.map((d) => ({
    value: `day:${d}`,
    date: d.slice(8).replace(/^0/, ''),
    label: weekdayName(d),
    dots: marks?.[d] || undefined,
  }));
  const current = viewOf(path);
  const onToday = current === 'today';
  const shownDay = onToday ? (shownParam ?? today) : null;
  const active = onToday
    ? shownDay === today
      ? 'today'
      : days.includes(shownDay!)
        ? `day:${shownDay}`
        : ''
    : current;
  const user = {
    initials: initialsOf(me.user.name, me.user.email),
    name: me.user.name || me.user.email,
    email: me.user.email,
    color: me.user.color ?? undefined,
    image: photoSrc(me.user.image),
  };
  const team = space.kind === 'team';
  // The one Inbox's count, with the macOS app's new version once until it is opened.
  const update = useUpdate().unread;
  const inboxCount = inboxTotal(me, update);
  const onInbox = current === 'inbox';
  const openInbox = () => void navigate({ href: INBOX_PATH });
  const onNotebook = current === 'notebook';
  const app = inApp();
  const items = sideItems(team, all);

  // Jira, once connected: the sidebar's Apps section, the top bar's button and a phone tab, each with the count.
  // All spaces has none: Jira is a space's.
  const spaceJira = useJira(space.id);
  useJiraCountOnFocus();
  const jira = all ? { ...spaceJira, conn: null, count: null } : spaceJira;
  const jiraFresh = useJiraFresh();
  const jiraOpen = jiraParam(loc.searchStr).open;
  const toggleJira = () => void navigate({ href: withJira(loc, jiraOpen ? false : null) });

  const go = (v: View) => void navigate({ href: pagePath(space.slug, all, v) });
  const onSelect = (value: string) => {
    if (value === 'app:Jira') {
      toggleJira();
      return;
    }
    if (value.startsWith('day:') || value === 'today') {
      showDay(value === 'today' ? null : value.slice(4), today);
      if (!onToday) go('today');
      return;
    }
    const v = VIEWS.find((x) => x.value === value);
    if (v) go(v.value);
  };
  // New task opens Quick Add over whatever you are doing; the search icon (the Search tab on phones) the panel.
  const newTask = () => openQuickAdd();
  const searchOpen = useSearchOpen();
  const feedbackOpen = useFeedback().open;
  const account = {
    theme: choice,
    onTheme: setTheme,
    onSettings: () => void navigate({ href: settingsHref(loc, space.slug, 'account', vp === 'phone') }),
    onFeedback: openFeedback,
    onSignOut: () => void signOut().then(() => navigate({ to: '/sign-in', replace: true })),
  };
  // Switching: the page fades out, the address changes behind it, the next page rises in.
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (leaveTimer.current && clearTimeout(leaveTimer.current)), []);
  const switchTo = (href: string) => {
    if (leaveTimer.current) return;
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      setLeaving(false);
      void navigate({ href });
    }, PAGE_OUT_MS);
  };
  const here = all ? ALL_SLUG : space.id;
  const keys = useAppShortcuts();
  const spaceList = switchSpaces(me.spaces, keys);
  const pickSpace = (s: SwitchSpace) => {
    if (s.id === here) return;
    if (s.id === ALL_SLUG) return switchTo(switchPath(path, ALL_SLUG));
    const next = me.spaces.find((x) => x.id === s.id);
    if (next) switchTo(switchPath(path, next.slug));
  };
  // The space keys (Settings › Shortcuts): ⌃0 All spaces, ⌃1 to ⌃9 a space by its place in the list. They work while
  // you type and never leave a character; under any other layer they wait.
  const latest = useRef({ keys, spaceList, here, pickSpace });
  useEffect(() => {
    latest.current = { keys, spaceList, here, pickSpace };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => spaceKey(e, latest.current);
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  const switcher = (variant: 'menu' | 'sheet', rail = false) => (
    <SpaceSwitch
      variant={variant}
      rail={rail}
      spaces={spaceList}
      active={here}
      onPick={pickSpace}
      onCreate={openCreateSpace}
    />
  );
  // Switching spaces fades the new page in; the shell around it never moves.
  const page = (
    <div key={here} className={cx('app-page-in', leaving && 'app-page-out')}>
      {children}
    </div>
  );
  const hosts = (
    <>
      <QuickAddHost me={me} />
      <SearchHost me={me} />
      <CreateSpaceHost />
      <MembersHost me={me} space={space} />
      <SettingsHost me={me} space={space} all={all} />
      {all ? <JiraConnectHost space={space} /> : <JiraHost space={space} />}
      {all ? null : <AppsHost space={space} />}
      <GettingStartedHost me={me} space={space} vp={vp} all={all} />
      <FeedbackHost space={space} vp={vp} />
      <NoteWindowHost />
    </>
  );

  if (vp === 'phone') {
    return (
      <div className="tp-root app-phone" data-viewport="phone">
        <header className="app-phone-head">
          {switcher('sheet')}
          <div className="app-phone-tools">
            <ScrambledPill />
            <button
              type="button"
              className={cx('app-phone-bug tp-tb-bug', feedbackOpen && 'tp-on')}
              aria-label="Report a bug or idea"
              aria-haspopup="dialog"
              onClick={openFeedback}
            >
              <Icon name="bug" size={20} />
            </button>
            <button
              type="button"
              className={cx('app-phone-inbox', onInbox && 'tp-on')}
              aria-label={inboxCount ? `Inbox, ${inboxCount} new` : 'Inbox'}
              onClick={openInbox}
            >
              <Icon name="inbox" size={20} />
              {inboxCount ? <span className="app-phone-pip">{inboxCount}</span> : null}
            </button>
            <button
              type="button"
              className={cx('app-phone-me', current === 'settings' && 'tp-on')}
              aria-label="Settings"
              onClick={() => go('settings')}
            >
              <Avatar
                initials={user.initials}
                name={user.name}
                color={user.color}
                image={user.image}
                size="sm"
              />
            </button>
          </div>
        </header>
        <div className="tp-scroll app-phone-scroll">{page}</div>
        <div className="app-phone-fab">
          <Fab label="New task" onClick={newTask} />
        </div>
        {hosts}
        <div className="app-phone-tabs">
          <BottomTabs
            items={[
              { value: 'today', label: 'Today', icon: 'today' },
              { value: 'week', label: 'Week', icon: 'week' },
              ...(jira.conn
                ? [
                    {
                      value: 'jira',
                      label: 'Jira',
                      icon: 'jira' as const,
                      badge: jira.count || undefined,
                      fresh: jiraFresh,
                    },
                  ]
                : []),
              { value: 'search', label: 'Search', icon: 'search' },
              { value: 'more', label: 'More', icon: 'more' },
            ]}
            active={phoneTab({ view: current, onToday, searchOpen, jira: !!jira.conn })}
            onSelect={(v) => {
              if (v === 'today' || v === 'week') onSelect(v);
              else if (v === 'jira') go('jira');
              else if (v === 'more') go('more');
              else if (v === 'search') openSearch();
            }}
          />
        </div>
      </div>
    );
  }

  const rail = vp === 'tablet';
  return (
    <div className="tp-root app-desk" data-viewport={vp}>
      <div className="app-side">
        {app ? <div className="app-drag-strip" data-tauri-drag-region="" /> : null}
        <Sidebar
          items={items}
          week={rail ? [] : week}
          head={switcher('menu', rail || collapsed)}
          connected={jira.conn ? [{ label: 'Jira', count: jira.count, fresh: jiraFresh }] : []}
          onAddApp={all ? undefined : openApps}
          active={active}
          onSelect={onSelect}
          rail={rail}
          collapsible={!rail}
          collapsed={rail ? true : collapsed}
          onCollapsedChange={setCollapsed}
        />
      </div>
      <main className="app-main">
        <div className="app-top">
          <TopBar
            compact={rail}
            dragRegion={app}
            jira={
              jira.conn
                ? { count: jira.count ?? undefined, open: jiraOpen, fresh: jiraFresh, onJira: toggleJira }
                : false
            }
            inbox={{ count: inboxCount, open: onInbox, onInbox: openInbox }}
            notebook={{ open: onNotebook, onNotebook: () => void navigate({ href: NOTEBOOK_PATH }) }}
            searchLabel="Search tasks and notes"
            onSearch={openSearch}
            searchOpen={searchOpen}
            onFeedback={openFeedback}
            feedbackOpen={feedbackOpen}
            onNewTask={newTask}
            views={
              onToday && vp === 'desktop'
                ? {
                    // The Backlog opens on the left of the day, so it comes first. Not in All spaces (yet).
                    items: [
                      ...(all ? [] : [{ value: 'backlog', label: 'Backlog' }]),
                      { value: 'one', label: 'Day' },
                      { value: 'two', label: '2 days' },
                    ],
                    value: all && view === 'backlog' ? 'one' : view,
                    onChange: (v) => setDayView(v === 'two' || v === 'backlog' ? v : 'one'),
                  }
                : undefined
            }
            user={user}
            account={account}
          />
        </div>
        <div className="tp-scroll app-scroll">{page}</div>
      </main>
      {hosts}
    </div>
  );
}
