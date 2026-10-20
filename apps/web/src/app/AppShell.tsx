import { useNavigate, useRouterState } from '@tanstack/react-router';
import { addDays, isoToday, weekdayName } from '@tudu/core';
import { Avatar, BottomTabs, Fab, Logo, Sidebar, TopBar, useTheme, type SidebarItem } from '@tudu/ui';
import { useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@tudu/client';
import { initialsOf, signOut } from './session';
import { useViewport } from './viewport';
import './shell.css';

const VIEWS: Array<{
  value: string;
  label: string;
  icon: 'today' | 'week' | 'backlog' | 'inbox';
  path: string;
}> = [
  { value: 'today', label: 'Today', icon: 'today', path: '/' },
  { value: 'week', label: 'Week', icon: 'week', path: '/week' },
  { value: 'backlog', label: 'Backlog', icon: 'backlog', path: '/backlog' },
  { value: 'inbox', label: 'Inbox', icon: 'inbox', path: '/inbox' },
];

const SIDEBAR_KEY = 'tudu.sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

/** The app around the page: sidebar, top bar and the scrolling column on the desk; the rail on tablets; tabs on phones. */
export function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
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

  const active = VIEWS.find((v) => v.path === path)?.value ?? 'today';
  const today = isoToday();
  const week = [1, 2, 3, 4, 5].map((n) => {
    const d = addDays(today, n);
    return { value: `day:${d}`, date: d.slice(8).replace(/^0/, ''), label: weekdayName(d) };
  });
  const user = {
    initials: initialsOf(me.user.name, me.user.email),
    name: me.user.name || me.user.email,
    email: me.user.email,
  };
  const items: SidebarItem[] = VIEWS.map((v) => ({ value: v.value, label: v.label, icon: v.icon }));
  const spaces = me.spaces.map((s) => ({ name: s.name, color: s.color ?? '#59554c' }));

  const onSelect = (value: string) => {
    const view = VIEWS.find((v) => v.value === value);
    if (view) void navigate({ to: view.path });
  };
  const account = {
    theme: choice,
    onTheme: setTheme,
    onSettings: () => {},
    onSignOut: () => void signOut().then(() => navigate({ to: '/sign-in', replace: true })),
  };

  if (vp === 'phone') {
    return (
      <div className="tp-root app-phone" data-viewport="phone">
        <header className="app-phone-head">
          <Logo size={22} wordmark />
          <Avatar initials={user.initials} name={user.name} size="sm" />
        </header>
        <div className="tp-scroll app-phone-scroll">{children}</div>
        <div className="app-phone-fab">
          <Fab label="New task" onClick={() => {}} />
        </div>
        <div className="app-phone-tabs">
          <BottomTabs
            items={[
              { value: 'today', label: 'Today', icon: 'today' },
              { value: 'week', label: 'Week', icon: 'week' },
              { value: 'search', label: 'Search', icon: 'search' },
              { value: 'more', label: 'More', icon: 'more' },
            ]}
            active={active === 'backlog' || active === 'inbox' ? 'more' : active}
            onSelect={(v) => {
              if (v === 'today' || v === 'week') onSelect(v);
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
          spaces={spaces}
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
            onSearch={() => {}}
            onNewTask={() => {}}
            user={user}
            account={account}
          />
        </div>
        <div className="tp-scroll app-scroll">{children}</div>
      </main>
    </div>
  );
}
