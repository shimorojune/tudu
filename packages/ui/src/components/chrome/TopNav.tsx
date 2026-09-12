import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import {
  isCommandPaletteBlocked,
} from "@/components/chrome/CommandPalette";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import { requestAddTask } from "@tudu/store";
import { useDispatch } from "react-redux";
import { BrandMark } from "@/components/chrome/BrandMark";
import { DateNav } from "@/components/chrome/DateNav";
import { DayJump } from "@/components/chrome/DayJump";
import { NavTabs } from "@/components/chrome/NavTabs";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { WeekPicker } from "@/components/chrome/WeekPicker";
import { ProjectFilter } from "@/components/projects/ProjectFilter";
import { isWeekPath, reportUserIdFromPath } from "@/lib/reportPath";
import { defaultWeekId, weekDaysFromWeekId } from "@/lib/week";

function NewTaskButton({ reportUserId }: { reportUserId: string | null }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  function handleClick() {
    if (reportUserId) {
      void navigate({
        to: "/team/$userId/inbox",
        params: { userId: reportUserId },
        search: { send: true },
      });
      return;
    }
    dispatch(requestAddTask());
  }

  return (
    <button
      type="button"
      aria-label="New task"
      className="flex shrink-0 items-center gap-[7px] bg-primary px-[9px] py-[7px] text-[12.5px] font-bold text-primary-foreground xl:px-[13px]"
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
      className="shrink-0 text-muted-foreground hover:text-foreground"
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
      className="shrink-0 text-muted-foreground"
    >
      <SlidersHorizontal size={17} strokeWidth={1.6} />
    </Link>
  );
}

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) => s.location.search as { week?: string },
  });
  const onWeek = isWeekPath(pathname);
  const reportUserId = reportUserIdFromPath(pathname);
  const showProjectFilter =
    pathname === "/" ||
    pathname === "/week" ||
    pathname === "/unscheduled" ||
    reportUserId !== null;
  const weekId = search.week ?? defaultWeekId();
  const weekDays = weekDaysFromWeekId(weekId);

  return (
    <header className="flex h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-center gap-[10px] overflow-hidden border-b border-rule bg-card px-[12px] pt-[env(safe-area-inset-top)] xl:gap-[28px] xl:px-[22px]">
      <BrandMark />
      <NavTabs />
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-[8px] xl:gap-[18px]">
        {onWeek ? (
          <WeekPicker
            weekId={weekId}
            weekDays={weekDays}
            to={reportUserId ? "/team/$userId/week" : "/week"}
            params={reportUserId ? { userId: reportUserId } : undefined}
          />
        ) : (
          <>
            <DateNav />
            <div className="hidden xl:flex">
              <DayJump />
            </div>
          </>
        )}
        {showProjectFilter ? <ProjectFilter /> : null}
        <div className="h-[20px] w-px bg-hair" />
        <CommandsButton />
        <NotificationBell />
        <NewTaskButton reportUserId={reportUserId} />
        <SettingsLink />
      </div>
    </header>
  );
}
