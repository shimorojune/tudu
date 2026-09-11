import type { ReactNode } from "react";
import { TeamAvatar } from "@/components/team/TeamAvatar";
import { cn } from "@/lib/utils";

export type TeamPersonRowProps = {
  name: string;
  subtitle: string;
  filled?: boolean;
  nowCount?: number;
  openCount?: number;
  slippingCount?: number;
  showCounts?: boolean;
  children?: ReactNode;
};

export function TeamPersonRow({
  name,
  subtitle,
  filled = false,
  nowCount = 0,
  openCount = 0,
  slippingCount = 0,
  showCounts = false,
  children,
}: TeamPersonRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[12px] border-b border-hair px-[16px] py-[16px] md:flex-row md:items-center md:px-[32px] md:py-[18px]",
        filled && "bg-foreground/[0.03]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-[14px] md:items-center">
        <TeamAvatar name={name} filled={filled} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">{name}</div>
          <div className="truncate text-[12px] text-muted-foreground">{subtitle}</div>
          {showCounts ? (
            <div className="mt-[8px] flex flex-wrap gap-[16px] text-[12.5px] text-muted-foreground">
              <span>
                Now <span className="tabular-nums text-foreground">{nowCount}</span>
              </span>
              <span>
                Open <span className="tabular-nums text-foreground">{openCount}</span>
              </span>
              <span className={slippingCount > 0 ? "font-bold text-primary" : undefined}>
                Slipping <span className="tabular-nums">{slippingCount}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className="flex gap-[8px] md:shrink-0 md:justify-end">{children}</div>
      ) : null}
    </div>
  );
}
