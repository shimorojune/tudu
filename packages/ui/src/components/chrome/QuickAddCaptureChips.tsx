import { Fragment, useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Link2 } from "lucide-react";
import { BUCKETS, type Bucket } from "@tudu/shared";
import { DEFAULT_NOW_SOFT_CAP } from "@tudu/shared";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import { DeadlineField } from "@/components/tasks/DeadlineField";
import { DateField } from "@/components/ui/date-field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { bucketLabel } from "@/lib/buckets";
import { cn } from "@/lib/utils";
import type { NewTaskDayChoice } from "@/components/tasks/TaskScheduleFields";

const chipBase =
  "inline-flex max-w-full items-center gap-[6px] border px-[10px] py-[5px] text-[12px] leading-none";

type QuickAddCaptureChipsProps = {
  dayChoice: NewTaskDayChoice;
  bucket: Bucket;
  pickedDate: string;
  today: string;
  nowCount: number;
  projectId: string | null;
  title: string;
  deadline: string | null;
  jevSuggesting: boolean;
  disabled?: boolean;
  onDayChoiceChange: (choice: NewTaskDayChoice) => void;
  onPickedDateChange: (iso: string) => void;
  onBucketChange: (bucket: Bucket) => void;
  onProjectChange: (projectId: string | null) => void;
  onDeadlineChange: (iso: string | null) => void;
  attachmentStrip?: ReactNode;
  tabNoteHint?: boolean;
};

function deadlineChipLabel(deadline: string | null): string {
  if (!deadline) {
    return "No deadline";
  }
  const parsed = parseISO(deadline);
  const time = format(parsed, "HH:mm");
  const datePart = format(parsed, "d MMM");
  if (time !== "18:00") {
    return `Due ${datePart}, ${time}`;
  }
  return `Due ${datePart}`;
}

function dayChipLabel(
  dayChoice: NewTaskDayChoice,
  pickedDate: string,
): string {
  if (dayChoice === "today") {
    return "Today";
  }
  if (dayChoice === "tomorrow") {
    return "Tomorrow";
  }
  if (dayChoice === "unscheduled") {
    return "Unscheduled";
  }
  try {
    return format(parseISO(`${pickedDate}T12:00:00`), "EEE d MMM");
  } catch {
    return "Date…";
  }
}

function dayChipFilled(dayChoice: NewTaskDayChoice): boolean {
  return dayChoice !== "today";
}

function extractJiraIssueKey(text: string): string | null {
  const match = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match?.[1] ?? null;
}

function bucketMenuDescription(
  value: Bucket,
  targetIsToday: boolean,
  nowFull: boolean,
): string {
  if (value === "now") {
    if (targetIsToday) {
      return nowFull
        ? "Full. Finish or move one first."
        : "Committed for today.";
    }
    return "Top priority for that day.";
  }
  if (value === "next") {
    return targetIsToday
      ? "Queued behind Now, same day."
      : "Queued behind Priority 1, same day.";
  }
  return "First to slip if the day runs out.";
}

function bucketMenuRow({
  label,
  countLabel,
  emphasizeCount,
  description,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  countLabel?: string;
  emphasizeCount?: boolean;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-[10px] gap-y-[3px] px-[13px] py-[10px] text-left border-b border-hair last:border-b-0",
        selected && "bg-tint shadow-[inset_2px_0_0_0_var(--foreground)]",
        disabled && "opacity-45",
      )}
      onClick={onSelect}
    >
      <span className="text-[13px] font-bold text-foreground">{label}</span>
      {countLabel ? (
        <span
          className={cn(
            "text-[11px] tabular-nums",
            emphasizeCount
              ? "border border-rule px-[6px] py-[2px] leading-none"
              : "font-mono text-muted-foreground",
          )}
        >
          {countLabel}
        </span>
      ) : null}
      <span className="col-span-2 text-[11.5px] leading-[1.45] text-muted-foreground">
        {description}
      </span>
    </button>
  );
}

export function formatQuickAddLandsIn({
  dayChoice,
  pickedDate,
  today,
  bucket,
  jiraKey,
}: {
  dayChoice: NewTaskDayChoice;
  pickedDate: string;
  today: string;
  bucket: Bucket;
  jiraKey: string | null;
}): { dayPart: string; bucketPart: string | null; jiraPart: string | null } {
  const dayPart = dayChipLabel(dayChoice, pickedDate);
  const bucketPart =
    dayChoice === "unscheduled"
      ? null
      : bucketLabel(bucket, dayChoice === "today" || pickedDate === today);
  return { dayPart, bucketPart, jiraPart: jiraKey };
}

export function QuickAddCaptureChips({
  dayChoice,
  bucket,
  pickedDate,
  today,
  nowCount,
  projectId,
  title,
  deadline,
  jevSuggesting,
  disabled = false,
  onDayChoiceChange,
  onPickedDateChange,
  onBucketChange,
  onProjectChange,
  onDeadlineChange,
  attachmentStrip,
  tabNoteHint = false,
}: QuickAddCaptureChipsProps) {
  const [dayOpen, setDayOpen] = useState(false);
  const [bucketOpen, setBucketOpen] = useState(false);
  const targetIsToday =
    dayChoice === "today" ||
    (dayChoice === "pick" && pickedDate === today);
  const isUnscheduled = dayChoice === "unscheduled";
  const jiraKey = useMemo(() => extractJiraIssueKey(title), [title]);
  const nowFull =
    targetIsToday && nowCount >= DEFAULT_NOW_SOFT_CAP;

  const dayFilled = dayChipFilled(dayChoice);

  return (
    <div
      className="relative z-10 flex flex-wrap items-center gap-[7px] overflow-y-visible px-[18px] pb-[14px] pt-0"
    >
      <Popover open={dayOpen} onOpenChange={setDayOpen}>
        <PopoverTrigger
          type="button"
          disabled={disabled}
          className={cn(
            chipBase,
            "font-bold",
            dayFilled
              ? "border-foreground bg-foreground text-card"
              : "border-foreground text-foreground",
          )}
        >
          {dayChipLabel(dayChoice, pickedDate)}
          <span
            className={cn(
              "font-normal",
              dayFilled ? "text-card/60" : "text-muted-foreground",
            )}
          >
            ▾
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[200] w-[264px] border-rule bg-card p-0 shadow-none"
        >
          <button
            type="button"
            className="w-full px-[13px] py-[10px] text-left text-[13px] font-bold border-b border-hair hover:bg-tint"
            onClick={() => {
              onDayChoiceChange("today");
              setDayOpen(false);
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="w-full px-[13px] py-[10px] text-left text-[13px] font-bold border-b border-hair hover:bg-tint"
            onClick={() => {
              onDayChoiceChange("tomorrow");
              setDayOpen(false);
            }}
          >
            Tomorrow
          </button>
          <button
            type="button"
            className="w-full px-[13px] py-[10px] text-left text-[13px] font-bold border-b border-hair hover:bg-tint"
            onClick={() => {
              onDayChoiceChange("unscheduled");
              setDayOpen(false);
            }}
          >
            Unscheduled
          </button>
          <div className="p-[10px]">
            <DateField
              value={dayChoice === "pick" ? pickedDate : ""}
              allowClear={false}
              quickAddShell
              emptyLabel="Pick a date…"
              aria-label="Task date"
              popoverAlign="start"
              className="w-full border border-rule bg-transparent px-[8px] py-[5px] text-[12px]"
              onChange={(value) => {
                if (!value) {
                  return;
                }
                onPickedDateChange(value);
                onDayChoiceChange("pick");
                setDayOpen(false);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Popover open={bucketOpen} onOpenChange={setBucketOpen}>
        <PopoverTrigger
          type="button"
          disabled={disabled || isUnscheduled}
          className={cn(
            chipBase,
            "font-bold",
            bucketOpen
              ? "border-primary shadow-[0_0_0_2px_var(--primary)]"
              : "border-foreground text-foreground",
            isUnscheduled && "opacity-50",
          )}
        >
          {bucketLabel(bucket, targetIsToday)}
          <span className="font-normal text-muted-foreground">▾</span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[200] w-[264px] border-rule bg-card p-0 shadow-none"
        >
          {BUCKETS.map((value) => (
            <Fragment key={value}>
              {bucketMenuRow({
                label: bucketLabel(value, targetIsToday),
                countLabel:
                  value === "now" && targetIsToday
                    ? `${nowCount} / ${DEFAULT_NOW_SOFT_CAP}`
                    : undefined,
                emphasizeCount: value === "now" && targetIsToday,
                description: bucketMenuDescription(
                  value,
                  targetIsToday,
                  nowFull,
                ),
                selected: bucket === value,
                disabled: value === "now" && nowFull,
                onSelect: () => {
                  onBucketChange(value);
                  setBucketOpen(false);
                },
              })}
            </Fragment>
          ))}
        </PopoverContent>
      </Popover>

      <ProjectPicker
        compact
        value={projectId}
        onChange={onProjectChange}
        triggerClassName={cn(
          chipBase,
          "border-rule font-normal text-muted-foreground hover:border-foreground",
          projectId && "border-foreground font-bold text-foreground",
          jevSuggesting && "quick-add-jev-label-shimmer",
        )}
      />

      <DeadlineField
        value={deadline}
        onChange={onDeadlineChange}
        allowClear
        quickAddShell
        disabled={disabled}
        aria-label="Deadline"
        popoverAlign="start"
        compactTriggerLabel={deadlineChipLabel(deadline)}
        className="min-w-0"
        leadingIcon={
          <Calendar className="size-[11px] shrink-0" aria-hidden />
        }
        triggerClassName={cn(
          chipBase,
          "w-auto flex-none font-normal hover:border-foreground",
          deadline
            ? "border-foreground font-bold text-foreground"
            : "border-rule text-muted-foreground",
          jevSuggesting && "quick-add-jev-label-shimmer",
        )}
      />

      {jiraKey ? (
        <span
          className={cn(
            chipBase,
            "border-primary font-bold font-mono text-primary-text",
          )}
        >
          <Link2 className="size-[11px] shrink-0" aria-hidden />
          {jiraKey}
        </span>
      ) : null}

      {attachmentStrip}

      {tabNoteHint ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-[6px] text-[11.5px] text-muted-foreground">
          <code className="font-mono text-[11px] text-foreground">tab</code>
          for a note
        </span>
      ) : null}

      <span
        className={cn(
          "hidden min-w-0 text-[11.5px] text-muted-foreground lg:inline",
          tabNoteHint ? "" : "ml-auto",
        )}
      >
        type{" "}
        <code className="font-mono text-[11px] text-foreground">/tmr</code>{" "}
        <code className="font-mono text-[11px] text-foreground">!now</code>{" "}
        <code className="font-mono text-[11px] text-foreground">@fri</code>{" "}
        <code className="font-mono text-[11px] text-foreground">#EGS</code> to
        skip the chips
      </span>
    </div>
  );
}
