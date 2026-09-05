import { useGetUnscheduledTasksQuery } from "@tudu/store";
import { TaskRow } from "@/components/tasks/TaskRow";
import { ScrollArea } from "@/components/ui/scroll-area";

export function UnscheduledRoute() {
  const { data, isLoading, isError } = useGetUnscheduledTasksQuery();

  if (isLoading) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-[28px] py-[24px] text-[14px] text-destructive">
        Could not load unscheduled tasks.
      </p>
    );
  }

  const tasks = data?.tasks ?? [];

  return (
    <div className="flex h-full flex-col bg-card">
      <header className="px-[28px] pb-[8px] pt-[24px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        Unscheduled
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {tasks.length === 0 ? (
          <p className="px-[28px] py-[16px] text-[13px] text-faint">
            Nothing unscheduled. Tasks without a day land here.
          </p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              bucket="later"
              selected={false}
              selectedDate=""
              onSelect={() => undefined}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
