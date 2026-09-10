import { Link, useRouterState } from "@tanstack/react-router";
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
import { WeekPicker } from "@/components/chrome/WeekPicker";
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
      className="flex items-center gap-[7px] bg-primary px-[13px] py-[7px] text-[12.5px] font-bold text-primary-foreground"
      onClick={handleClick}
    >
      <Plus size={13} strokeWidth={2.4} />
      New task
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
      className="text-muted-foreground hover:text-foreground"
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
      className="text-muted-foreground"
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
  const onWeek = pathname === "/week";
  const weekId = search.week ?? defaultWeekId();
  const weekDays = weekDaysFromWeekId(weekId);

  return (
    <header className="flex h-[56px] shrink-0 items-center gap-[28px] border-b border-rule bg-card px-[22px]">
      <BrandMark />
      <NavTabs />
      <div className="ml-auto flex items-center gap-[18px]">
        {onWeek ? (
          <WeekPicker weekId={weekId} weekDays={weekDays} />
        ) : (
          <>
            <DateNav />
            <DayJump />
          </>
        )}
        <div className="h-[20px] w-px bg-hair" />
        <CommandsButton />
        <NewTaskButton />
        <SettingsLink />
      </div>
    </header>
  );
}
