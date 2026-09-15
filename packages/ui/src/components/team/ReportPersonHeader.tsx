import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useSelector } from "react-redux";
import { todayIso, type RootState } from "@tudu/store";
import { personInitials } from "@/lib/person";
import { dateLinkSearch } from "@/lib/daySearch";
import { isoWeekId, parseIsoDate } from "@/lib/week";
import { cn } from "@/lib/utils";

export type ReportPersonHeaderProps = {
  userId: string;
  name: string;
  view: "day" | "week" | "inbox";
  canSend?: boolean;
  onSend: () => void;
};

export function ReportPersonHeader({
  userId,
  name,
  view,
  canSend = true,
  onSend,
}: ReportPersonHeaderProps) {
  const selectedDate =
    useSelector((state: RootState) => state.day.selectedDate) || todayIso();
  const weekId = isoWeekId(parseIsoDate(selectedDate));

  return (
    <div className="flex h-[56px] shrink-0 items-center gap-[12px] border-b border-rule bg-card px-[12px] md:gap-[16px] md:px-[22px]">
      <Link
        to="/team"
        className="flex items-center gap-[8px] text-[13px] text-muted-foreground"
      >
        <ChevronLeft size={15} strokeWidth={1.9} />
        Team
      </Link>
      <div className="flex min-w-0 items-center gap-[12px]">
        <div className="flex size-[26px] shrink-0 items-center justify-center bg-foreground text-[11px] font-extrabold text-card">
          {personInitials(name)}
        </div>
        <span className="truncate text-[16px] font-extrabold tracking-[-0.02em]">
          {name}
        </span>
        <span className="hidden text-[12px] text-faint md:inline">
          reports to you
        </span>
      </div>
      <div className="flex items-center border border-rule">
        <Link
          to="/team/$userId"
          params={{ userId }}
          search={dateLinkSearch(selectedDate, { send: false })}
          className={cn(
            "px-[10px] py-[5px] text-[12px]",
            view === "day"
              ? "bg-foreground font-bold text-card"
              : "text-muted-foreground",
          )}
        >
          Day
        </Link>
        <Link
          to="/team/$userId/week"
          params={{ userId }}
          search={{ week: weekId }}
          className={cn(
            "px-[10px] py-[5px] text-[12px]",
            view === "week"
              ? "bg-foreground font-bold text-card"
              : "text-muted-foreground",
          )}
        >
          Week
        </Link>
        <Link
          to="/team/$userId/inbox"
          params={{ userId }}
          search={{ send: false }}
          className={cn(
            "px-[10px] py-[5px] text-[12px]",
            view === "inbox"
              ? "bg-foreground font-bold text-card"
              : "text-muted-foreground",
          )}
        >
          Inbox
        </Link>
      </div>
      <button
        type="button"
        disabled={!canSend}
        className="ml-auto text-[12.5px] text-muted-foreground disabled:opacity-40"
        onClick={onSend}
      >
        Send a task
      </button>
    </div>
  );
}
