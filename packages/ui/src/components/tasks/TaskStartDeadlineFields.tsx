import { format, parseISO } from "date-fns";
import { validateStartBeforeDeadline } from "@tudu/shared";
import { DateField } from "@/components/ui/date-field";
import { DeadlineField } from "@/components/tasks/DeadlineField";
import { cn } from "@/lib/utils";

export type TaskStartDeadlineFieldsProps = {
  startDate: string;
  deadline: string | null;
  onStartDateChange: (value: string) => void;
  onDeadlineChange: (value: string | null) => void;
  layout?: "stacked" | "quickAdd";
};

function quickAddDueLabel(deadline: string | null): string {
  if (!deadline) {
    return "Due";
  }
  const date = parseISO(deadline);
  return `Due ${format(date, "d MMM")}`;
}

export function TaskStartDeadlineFields({
  startDate,
  deadline,
  onStartDateChange,
  onDeadlineChange,
  layout = "stacked",
}: TaskStartDeadlineFieldsProps) {
  const validationError = validateStartBeforeDeadline(
    startDate || null,
    deadline,
  );

  const labelClass =
    layout === "quickAdd"
      ? "w-[56px] shrink-0 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint"
      : "text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint";

  const popoverSide = "bottom";

  if (layout === "quickAdd") {
    return (
      <div className="space-y-[6px]">
        <div className="flex flex-nowrap items-center gap-[8px]">
          <div className={labelClass}>Timing</div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[6px]">
            <DateField
              value={startDate}
              onChange={onStartDateChange}
              allowClear
              aria-label="Start date"
              emptyLabel="Start"
              labelPrefix={startDate ? "Start " : undefined}
              popoverSide={popoverSide}
              popoverAlign="start"
              quickAddShell
              className="w-auto border border-rule bg-transparent px-[8px] py-[4px] text-[12px]"
            />
            <DeadlineField
              value={deadline}
              onChange={onDeadlineChange}
              aria-label="Deadline"
              popoverSide={popoverSide}
              popoverAlign="end"
              quickAddShell
              compactTriggerLabel={quickAddDueLabel(deadline)}
              className="w-auto text-[12px]"
              triggerClassName="w-auto flex-none border border-rule bg-transparent px-[8px] py-[4px] text-[12px]"
            />
          </div>
        </div>
        {validationError ? (
          <p className="pl-[64px] text-[11px] text-destructive">{validationError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-[8px]">
      <div className="space-y-[8px]">
        <div className={labelClass}>Start</div>
        <DateField
          value={startDate}
          onChange={onStartDateChange}
          allowClear
          aria-label="Start date"
          popoverSide={popoverSide}
        />
      </div>
      <div className="space-y-[8px]">
        <div className={labelClass}>Deadline</div>
        <DeadlineField
          value={deadline}
          onChange={onDeadlineChange}
          popoverSide={popoverSide}
        />
      </div>
      {validationError ? (
        <p className={cn("text-[12px] text-destructive")}>{validationError}</p>
      ) : null}
    </div>
  );
}
