import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { addDays, membersWords, spaceInitials, weekdayName, type SpaceSummary } from '@tudu/core';
import {
  Avatar,
  BottomTabs,
  Fab,
  Sidebar,
  SpaceSwitch,
  TopBar,
  useTheme,
  type SidebarItem,
  type SwitchSpace,
} from '@tudu/ui';
import { useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@tudu/client';
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
import { SearchHost } from './SearchHost';
import { QuickAddHost } from './quickAdd';
import { initialsOf, signOut } from './session';
import { spacePath, switchPath, viewOf, type View } from './space';
import { CreateSpaceHost, MembersHost } from './spaces';
import { taskStore } from './tasks';
import { useViewport } from './viewport';
import { useWorkingDay } from './workingDay';
import './shell.css';

const VIEWS: Array<{
  value: View;
  label: string;
  icon: 'today' | 'week' | 'backlog' | 'inbox' | 'team';
  /** Team spaces only. */
  team?: boolean;
}> = [
  { value: 'today', label: 'Today', icon: 'today' },
  { value: 'week', label: 'Week', icon: 'week' },
  { value: 'backlog', label: 'Backlog', icon: 'backlog' },
  { value: 'people', label: 'People', icon: 'team', team: true },
  { value: 'inbox', label: 'Inbox', icon: 'inbox' },
];

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
export function phoneTab(at: { view: View; onToday: boolean; searchOpen: boolean }): string {
  if (at.searchOpen) return 'search';
  if (at.view === 'backlog' || at.view === 'inbox' || at.view === 'people' || at.view === 'more')
    return 'more';
  return at.onToday ? 'today' : at.view;
}

/** The spaces as the switcher lists them: Personal first, each with its quiet line. */
export function switchSpaces(spaces: SpaceSummary[]): SwitchSpace[] {
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? undefined,
    personal: s.kind === 'personal',
    initials: spaceInitials(s.name),
    sub: membersWords(s.members),
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
  const path = useRouterState({ select: (s) => s.location.pathname });
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
  };
  const team = space.kind === 'team';
  const items: SidebarItem[] = VIEWS.filter((v) => team || !v.team).map((v) => ({
    value: v.value,
    label: v.label,
    icon: v.icon,
  }));

  const go = (v: View) => void navigate({ href: spacePath(space.slug, v) });
  const onSelect = (value: string) => {
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
    onSettings: () => {},
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
    </>
  );

  if (vp === 'phone') {
    return (
      <div className="tp-root app-phone" data-viewport="phone">
        <header className="app-phone-head">
          {switcher('sheet')}
          <Avatar initials={user.initials} name={user.name} size="sm" />
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
              { value: 'search', label: 'Search', icon: 'search' },
              { value: 'more', label: 'More', icon: 'more' },
            ]}
            active={phoneTab({ view: current, onToday, searchOpen })}
            onSelect={(v) => {
              if (v === 'today' || v === 'week') onSelect(v);
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
        <Sidebar
          items={items}
          week={rail ? [] : week}
          head={switcher('menu', rail || collapsed)}
          connected={[]}
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
            jira={false}
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
