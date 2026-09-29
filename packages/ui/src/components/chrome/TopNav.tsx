import { Link, useRouterState } from "@tanstack/react-router";
import { Plus, Search, SlidersHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import { requestAddTask } from "@tudu/store";
import { useDispatch } from "react-redux";
import { SpaceSwitcher } from "@/components/orgs/SpaceSwitcher";
import { NavTabs } from "@/components/chrome/NavTabs";
import { useDayShortcuts } from "@/hooks/useDayShortcuts";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { WeekPicker } from "@/components/chrome/WeekPicker";
import { isWeekPath } from "@/lib/weekPath";
import { InviteDialog } from "@/components/orgs/InviteDialog";
import { useActiveOrgSlug, useSpaceContext } from "@/hooks/useSpaceContext";
import {
  isCoworkersRosterPath,
  isTodayRoutePath,
} from "@/lib/spaceNav";
import { useSpaceShortcuts } from "@/hooks/useSpaceShortcuts";
import { defaultWeekId, weekDaysFromWeekId } from "@/lib/week";

function NewTaskButton() {
  const dispatch = useDispatch();

  function handleClick() {
    dispatch(requestAddTask());
  }

  return (
    <button
      type="button"
      aria-label="New task"
      className="flex size-[36px] shrink-0 items-center justify-center bg-primary text-[12.5px] font-bold text-primary-foreground xl:h-auto xl:w-auto xl:gap-[7px] xl:px-[13px] xl:py-[7px]"
      onClick={handleClick}
    >
      <Plus size={13} strokeWidth={2.4} />
      <span className="hidden xl:inline">New task</span>
    </button>
  );
}

function CommandsButton() {
  const { openPalette } = useCommandPalette();

  return (
    <button
      type="button"
      aria-label="Commands"
      title="Cmd+K"
      className="flex size-[36px] shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      onClick={() => {
        if (!isCommandPaletteBlocked()) {
          openPalette();
        }
      }}
    >
      <Search size={17} strokeWidth={1.6} />
    </button>
  );
}

function SettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className="flex size-[36px] shrink-0 items-center justify-center text-muted-foreground"
    >
      <SlidersHorizontal size={17} strokeWidth={1.6} />
    </Link>
  );
}

function InviteCoworkersButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Invite co-workers"
      className="flex size-[36px] shrink-0 items-center justify-center text-muted-foreground hover:text-foreground xl:h-auto xl:w-auto xl:gap-[7px] xl:border xl:border-rule xl:px-[13px] xl:py-[7px] xl:text-[12.5px] xl:font-bold"
      onClick={onClick}
    >
      <UserPlus size={15} strokeWidth={1.8} />
      <span className="hidden xl:inline">Invite co-workers</span>
    </button>
  );
}

export function TopNav() {
  useSpaceContext();
  useSpaceShortcuts();
  useDayShortcuts();
  const orgSlug = useActiveOrgSlug();
  const [inviteOpen, setInviteOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showNewTask = isTodayRoutePath(pathname, orgSlug);
  const showInvite = isCoworkersRosterPath(pathname, orgSlug);
  const search = useRouterState({
    select: (s) => s.location.search as { week?: string },
  });
  const onWeek = isWeekPath(pathname);
  const weekId = search.week ?? defaultWeekId();
  const weekDays = weekDaysFromWeekId(weekId);

  return (
    <header
      data-testid="top-nav"
      className="flex h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-center gap-[10px] overflow-hidden border-b border-rule bg-card px-[12px] pt-[env(safe-area-inset-top)] xl:gap-[28px] xl:px-[22px]"
    >
      <SpaceSwitcher />
      <NavTabs />
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-[12px] xl:gap-[18px]">
        {onWeek ? <WeekPicker weekId={weekId} weekDays={weekDays} /> : null}
        <div className="h-[20px] w-px bg-hair" />
        <CommandsButton />
        <NotificationBell />
        {showInvite ? (
          <InviteCoworkersButton onClick={() => setInviteOpen(true)} />
        ) : null}
        {showNewTask ? <NewTaskButton /> : null}
        <SettingsLink />
      </div>
      {orgSlug && showInvite ? (
        <InviteDialog
          slug={orgSlug}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      ) : null}
    </header>
  );
}
