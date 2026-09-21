import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import { requestAddTask, useGetNotificationsQuery } from "@tudu/store";
import { useDispatch } from "react-redux";
import { BrandMark } from "@/components/chrome/BrandMark";
import { DateNav } from "@/components/chrome/DateNav";
import { DayJump } from "@/components/chrome/DayJump";
import { NavTabs } from "@/components/chrome/NavTabs";
import { NotificationBell } from "@/components/chrome/NotificationBell";
import { WeekPicker } from "@/components/chrome/WeekPicker";
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

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: notificationsData } = useGetNotificationsQuery();
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const search = useRouterState({
    select: (s) => s.location.search as { week?: string },
  });
  const onWeek = isWeekPath(pathname);
  const reportUserId = reportUserIdFromPath(pathname);
  const weekId = search.week ?? defaultWeekId();
  const weekDays = weekDaysFromWeekId(weekId);

  return (
    <header
      data-testid="top-nav"
      className="flex h-[calc(56px+env(safe-area-inset-top))] shrink-0 items-center gap-[10px] overflow-hidden border-b border-rule bg-card px-[12px] pt-[env(safe-area-inset-top)] xl:gap-[28px] xl:px-[22px]"
    >
      <BrandMark showUnreadIndicator={unreadCount > 0} />
      <NavTabs />
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-[12px] xl:gap-[18px]">
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
        <div className="h-[20px] w-px bg-hair" />
        <CommandsButton />
        <NotificationBell />
        <NewTaskButton reportUserId={reportUserId} />
        <SettingsLink />
      </div>
    </header>
  );
}
