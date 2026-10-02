type TaskDetailWidgetProps = {
  task?: {
    id?: string;
    title?: string;
    description?: string | null;
    key?: string | null;
    scheduledDate?: string | null;
  } | null;
};

export function TaskDetailWidget({ task }: TaskDetailWidgetProps) {
  if (!task) {
    return <p className="text-sm text-muted-foreground">Task not found.</p>;
  }

  return (
    <div className="flex flex-col gap-2 border border-rule p-4 text-sm">
      <h2 className="text-base font-extrabold">{task.title ?? "Untitled"}</h2>
      {task.key ? (
        <p className="text-xs text-muted-foreground">{task.key}</p>
      ) : null}
      {task.scheduledDate ? (
        <p className="text-muted-foreground">Scheduled: {task.scheduledDate}</p>
      ) : null}
      {task.description ? (
        <div
          className="prose prose-sm max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: task.description }}
        />
      ) : null}
    </div>
  );
}
