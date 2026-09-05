import { CalendarDays } from "lucide-react";

export function DetailInspectorEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[14px] bg-background px-[40px] text-center">
      <CalendarDays size={26} strokeWidth={1.4} className="text-ghost" aria-hidden />
      <p className="max-w-[230px] text-[14px] leading-relaxed text-muted-foreground">
        Select a task to see its detail, comments and timeline.
      </p>
      <div className="h-[30px]" aria-hidden />
    </div>
  );
}
