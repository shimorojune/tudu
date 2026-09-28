import { Link } from "@tanstack/react-router";
import type { CoworkerRosterEntry } from "@tudu/shared";
import {
  formatLastSeenSubtitle,
  lastSeenPhrase,
} from "@tudu/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CoworkerPersonRowProps = {
  orgSlug: string;
  entry: CoworkerRosterEntry;
  now: Date;
};

function displayName(entry: CoworkerRosterEntry): string {
  return entry.name ?? entry.email;
}

export function CoworkerPersonRow({
  orgSlug,
  entry,
  now,
}: CoworkerPersonRowProps) {
  const phrase = lastSeenPhrase(entry.lastSeenAt, now);
  const subtitle = formatLastSeenSubtitle(phrase, entry.nowTitle);

  return (
    <div
      className={cn(
        "flex flex-col gap-[12px] border-b border-hair px-[22px] py-[16px] md:flex-row md:items-center md:py-[18px]",
        entry.isSelf && "bg-foreground/[0.03]",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="flex items-baseline gap-[8px]">
          <span className="text-[15px] font-semibold">{displayName(entry)}</span>
          {entry.isSelf ? (
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              You
            </span>
          ) : null}
        </div>
        <p className="text-[12px] text-muted-foreground">{subtitle}</p>
        <div className="flex flex-wrap gap-[16px] text-[12.5px] text-muted-foreground">
          <span>
            Now{" "}
            <span className="tabular-nums text-foreground">{entry.nowCount}</span>
          </span>
          <span>
            Open{" "}
            <span className="tabular-nums text-foreground">{entry.openCount}</span>
          </span>
          <span
            className={
              entry.slippingCount > 0 ? "font-semibold text-primary-text" : undefined
            }
          >
            Slipping{" "}
            <span className="tabular-nums">{entry.slippingCount}</span>
          </span>
        </div>
      </div>
      {entry.isSelf ? null : (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link
            to="/o/$orgSlug/coworkers/$userId"
            params={{ orgSlug, userId: entry.userId }}
          >
            Open day
          </Link>
        </Button>
      )}
    </div>
  );
}
