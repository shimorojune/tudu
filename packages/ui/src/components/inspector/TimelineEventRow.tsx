import type { TimelinePart } from "@/lib/timelineCopy";
import { cn } from "@/lib/utils";

export type TimelineEventRowProps = {
  timeLabel: string;
  isSystem: boolean;
  parts: TimelinePart[];
  isLast: boolean;
  compact?: boolean;
};

function renderPart(part: TimelinePart, index: number) {
  if (part.kind === "mono") {
    return (
      <span key={index} className="font-mono tabular-nums">
        {part.text}
      </span>
    );
  }

  return (
    <span
      key={index}
      className={cn(
        part.muted && "text-muted-foreground",
        part.bold && "font-bold",
        part.accent && "text-primary",
      )}
    >
      {part.text}
    </span>
  );
}

export function TimelineEventRow({
  timeLabel,
  isSystem,
  parts,
  isLast,
  compact = false,
}: TimelineEventRowProps) {
  if (compact) {
    return (
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-[12px] py-[6px] text-[12.5px] leading-[1.5]">
        <span className="pt-px font-mono text-[11px] tabular-nums text-faint">
          {timeLabel}
        </span>
        <p className={cn(isSystem && "text-muted-foreground")}>
          {parts.map(renderPart)}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[46px_11px_minmax(0,1fr)] gap-x-[12px] py-[10px]">
      <span className="font-mono text-[11px] tabular-nums text-faint">{timeLabel}</span>
      <div className="relative flex justify-center">
        {!isLast ? (
          <span
            className="absolute top-[11px] bottom-[-10px] w-px bg-hair"
            aria-hidden
          />
        ) : null}
        <span
          className={cn(
            "relative z-[1] mt-[3px] block h-[7px] w-[7px] shrink-0",
            isSystem ? "bg-ghost" : "bg-foreground",
          )}
          aria-hidden
        />
      </div>
      <p className="text-[13px] leading-[1.45]">{parts.map(renderPart)}</p>
    </div>
  );
}
