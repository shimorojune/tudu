type TaskListWidgetProps = {
  tasks?: Array<{
    id?: string;
    title?: string;
    completedAt?: string | null;
    key?: string | null;
  }>;
};

export function TaskListWidget({ tasks = [] }: TaskListWidgetProps) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No tasks in this view.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <li
          key={task.id ?? task.title}
          className="border border-rule px-3 py-2 text-sm"
        >
          <div className="font-semibold">{task.title ?? "Untitled"}</div>
          {task.key ? (
            <div className="text-xs text-muted-foreground">{task.key}</div>
          ) : null}
          {task.completedAt ? (
            <div className="text-xs text-muted-foreground">Completed</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
