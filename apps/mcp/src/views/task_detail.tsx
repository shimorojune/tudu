import { TaskDetailWidget } from "@tudu/ui/mcp-widgets/TaskDetailWidget";
import { useToolInfo } from "skybridge/web";

type TaskDetailOutput = {
  task?: {
    id?: string;
    title?: string;
    description?: string | null;
    key?: string | null;
    completedAt?: string | null;
  };
};

export default function TaskDetailView() {
  const { isSuccess, output } = useToolInfo<{ output: TaskDetailOutput }>();
  return <TaskDetailWidget task={isSuccess ? output?.task : undefined} />;
}
