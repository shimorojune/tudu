import { useMemo } from "react";
import type { Bucket } from "@tudu/shared";
import { BUCKETS, DEFAULT_NOW_SOFT_CAP } from "@tudu/shared";
import { todayIso } from "@tudu/store";
import { DateField } from "@/components/ui/date-field";
import { bucketLabel } from "@/lib/buckets";
import { cn } from "@/lib/utils";

export type NewTaskDayChoice = "today" | "tomorrow" | "pick" | "unscheduled";

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
};

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  size = "md",
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full border border-rule",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            className={cn(
              "flex items-center gap-[4px] leading-none whitespace-nowrap",
              size === "sm"
                ? "px-[9px] py-[5px] text-[12px]"
                : "gap-[6px] px-[13px] py-[8px] text-[13px]",
              index < options.length - 1 && "border-r border-rule",
              selected
                ? "bg-foreground font-bold text-card"
                : "bg-transparent font-normal text-muted-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.hint ? (
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  selected ? "text-card/60" : "text-muted-foreground",
                )}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function offsetIso(fromIso: string, dayOffset: number) {
  const date = new Date(`${fromIso}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type TaskScheduleFieldsProps = {
  dayChoice: NewTaskDayChoice;
  bucket: Bucket;
  pickedDate: string;
  nowCount: number;
  compact?: boolean;
  layout?: "stacked" | "quickAdd";
  onDayChoiceChange: (choice: NewTaskDayChoice) => void;
  onBucketChange: (bucket: Bucket) => void;
  onPickedDateChange: (iso: string) => void;
};

export function TaskScheduleFields({
  dayChoice,
  bucket,
  pickedDate,
  nowCount,
  compact = false,
  layout = "stacked",
  onDayChoiceChange,
  onBucketChange,
  onPickedDateChange,
}: TaskScheduleFieldsProps) {
  const today = todayIso();
  const scheduledDate = useMemo(() => {
    if (dayChoice === "unscheduled") {
      return null;
    }
    if (dayChoice === "today") {
      return today;
    }
    if (dayChoice === "tomorrow") {
      return offsetIso(today, 1);
    }
    return pickedDate;
  }, [dayChoice, pickedDate, today]);

  const targetIsToday = scheduledDate === today;
  const isUnscheduled = dayChoice === "unscheduled";

  const labelClass = compact
    ? "text-[10px] font-extrabold uppercase tracking-[0.14em] text-faint"
    : "text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint";

  const quickAddLabelClass =
    "w-[56px] shrink-0 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint";
  const segmentSize = layout === "quickAdd" ? "sm" : "md";

  const dayOptions =
    layout === "quickAdd"
      ? [
          { value: "today" as const, label: "Today" },
          { value: "tomorrow" as const, label: "Tomorrow" },
          { value: "pick" as const, label: "Date…" },
          { value: "unscheduled" as const, label: "None" },
        ]
      : [
          { value: "today" as const, label: "Today" },
          { value: "tomorrow" as const, label: "Tomorrow" },
          { value: "pick" as const, label: "Pick a date…" },
          { value: "unscheduled" as const, label: "Unscheduled" },
        ];

  if (layout === "quickAdd") {
    return (
      <div className="space-y-[6px]">
        <div className="flex flex-nowrap items-center gap-[8px]">
          <div className={quickAddLabelClass}>Day</div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[6px]">
            <SegmentedControl
              size={segmentSize}
              value={dayChoice}
              onChange={onDayChoiceChange}
              options={dayOptions}
            />
            {dayChoice === "pick" ? (
              <DateField
                value={pickedDate}
                allowClear={false}
                onChange={onPickedDateChange}
                aria-label="Task date"
                className="w-auto bg-transparent px-[8px] py-[4px] text-[12px]"
              />
            ) : null}
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-[8px]">
          <div className={quickAddLabelClass}>Bucket</div>
          <div className="min-w-0 flex-1">
            <SegmentedControl
              size={segmentSize}
              value={bucket}
              disabled={isUnscheduled}
              onChange={onBucketChange}
              options={BUCKETS.map((value) => ({
                value,
                label: bucketLabel(value, targetIsToday),
                hint:
                  value === "now" && targetIsToday
                    ? `${nowCount}/${DEFAULT_NOW_SOFT_CAP}`
                    : undefined,
              }))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-[10px]", !compact && "space-y-[8px]")}>
      <div className="space-y-[6px]">
        <div className={labelClass}>Day</div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <SegmentedControl
            size={segmentSize}
            value={dayChoice}
            onChange={onDayChoiceChange}
            options={dayOptions}
          />
          {dayChoice === "pick" ? (
            <DateField
              value={pickedDate}
              allowClear={false}
              onChange={onPickedDateChange}
              aria-label="Task date"
              className="w-auto bg-transparent px-[10px] py-[7px] text-[13px]"
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-[6px]">
        <div className={labelClass}>Bucket</div>
        <div className="flex flex-wrap items-center gap-[10px]">
          <SegmentedControl
            size={segmentSize}
            value={bucket}
            disabled={isUnscheduled}
            onChange={onBucketChange}
            options={BUCKETS.map((value) => ({
              value,
              label: bucketLabel(value, targetIsToday),
              hint:
                value === "now" && targetIsToday
                  ? `${nowCount} / ${DEFAULT_NOW_SOFT_CAP}`
                  : undefined,
            }))}
          />
          {isUnscheduled ? (
            <span className="text-[12px] text-muted-foreground">
              An unscheduled task has no bucket
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function resolveScheduledDate(
  dayChoice: NewTaskDayChoice,
  pickedDate: string,
  today: string,
): string | null {
  if (dayChoice === "unscheduled") {
    return null;
  }
  if (dayChoice === "today") {
    return today;
  }
  if (dayChoice === "tomorrow") {
    return offsetIso(today, 1);
  }
  return pickedDate;
}
