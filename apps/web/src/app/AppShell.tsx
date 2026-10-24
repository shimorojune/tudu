import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { addDays, inboxBadge, membersWords, spaceInitials, weekdayName, type SpaceSummary } from '@tudu/core';
import {
  Avatar,
  BottomTabs,
  Fab,
  Icon,
  Sidebar,
  SpaceSwitch,
  TopBar,
  useTheme,
  type SidebarItem,
  type SwitchSpace,
} from '@tudu/ui';
import { useEffect, useState, type ReactNode } from 'react';
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
import { FeedbackHost, openFeedback } from './feedback';
import { GettingStartedHost } from './firstRun';
import { SearchHost } from './SearchHost';
import { AppsHost, JiraHost } from './JiraHost';
import { jiraParam, openApps, useJira, useJiraFresh, withJira } from './jira';
import { QuickAddHost } from './quickAdd';
import { initialsOf, photoSrc, signOut } from './session';
import { SettingsHost, settingsHref } from './settings';
import { inApp } from './desktop';
import { inboxTotal, useUpdate } from './updates';
import { INBOX_PATH, spacePath, switchPath, viewOf, type View } from './space';
import { CreateSpaceHost, MembersHost } from './spaces';
import { taskStore } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';
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

/** The sidebar's views: the space's own pages. The Inbox is across spaces, so it opens from the top bar. */
export function sideItems(team: boolean): SidebarItem[] {
  return VIEWS.filter((v) => team || !v.team).map((v) => ({ value: v.value, label: v.label, icon: v.icon }));
}

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
    at.view === 'backlog' ||
    at.view === 'people' ||
    at.view === 'more' ||
    at.view === 'settings'
  )
    return 'more';
  return at.onToday ? 'today' : at.view;
}

/** The spaces as the switcher lists them: Personal first, each with its quiet line and its own Inbox count. */
export function switchSpaces(spaces: SpaceSummary[]): SwitchSpace[] {
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? undefined,
    personal: s.kind === 'personal',
    initials: spaceInitials(s.name),
    sub: membersWords(s.members),
    count: inboxBadge(s.inbox) || undefined,
  }));
}

/**
 * The app around the page: sidebar, top bar and the scrolling column on the desk; the rail on tablets; tabs on
 * phones. The space's name at the top opens the list of spaces; switching keeps the view and fades the page in.
 */
export function AppShell({
  me,
  space,
  children,
}: {
  me: MeResponse;
  space: SpaceSummary;
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
  const marks = useQuery({
    ...taskStore.marksQuery(space.id, days[0]!, days[4]!),
    enabled: vp === 'desktop',
  }).data;
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
  const app = inApp();
  const items = sideItems(team);

  // Jira, once connected: the sidebar's Apps section, the top bar's button and a phone tab, each with the count.
  const jira = useJira(space.id);
  const jiraFresh = useJiraFresh();
  const jiraOpen = jiraParam(loc.searchStr).open;
  const toggleJira = () => void navigate({ href: withJira(loc, jiraOpen ? false : null) });

  const go = (v: View) => void navigate({ href: spacePath(space.slug, v) });
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
  const account = {
    theme: choice,
    onTheme: setTheme,
    onSettings: () => void navigate({ href: settingsHref(loc, space.slug, 'account', vp === 'phone') }),
    onFeedback: openFeedback,
    onSignOut: () => void signOut().then(() => navigate({ to: '/sign-in', replace: true })),
  };
  const switcher = (variant: 'menu' | 'sheet', rail = false) => (
    <SpaceSwitch
      variant={variant}
      rail={rail}
      spaces={switchSpaces(me.spaces)}
      active={space.id}
      onPick={(s) => {
        const next = me.spaces.find((x) => x.id === s.id);
        if (next) void navigate({ href: switchPath(path, next.slug) });
      }}
      onCreate={openCreateSpace}
    />
  );
  // Switching spaces fades the new page in; the shell around it never moves.
  const page = (
    <div key={space.id} className="app-page-in">
      {children}
    </div>
  );
  const hosts = (
    <>
      <QuickAddHost me={me} />
      <SearchHost me={me} />
      <CreateSpaceHost />
      <MembersHost me={me} space={space} />
      <SettingsHost me={me} space={space} />
      <JiraHost space={space} />
      <AppsHost space={space} />
      <GettingStartedHost me={me} space={space} vp={vp} />
      <FeedbackHost space={space} vp={vp} />
    </>
  );

  if (vp === 'phone') {
    return (
      <div className="tp-root app-phone" data-viewport="phone">
        <header className="app-phone-head">
          {switcher('sheet')}
          <div className="app-phone-tools">
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
          onAddApp={openApps}
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
            onSearch={openSearch}
            searchOpen={searchOpen}
            onNewTask={newTask}
            views={
              onToday && vp === 'desktop'
                ? {
                    items: [
                      { value: 'one', label: 'Day' },
                      { value: 'two', label: '2 days' },
                    ],
                    value: view,
                    onChange: (v) => setDayView(v === 'two' ? 'two' : 'one'),
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
