import { TaskListWidget } from "@tudu/ui/mcp-widgets/TaskListWidget";
import { useToolInfo } from "skybridge/web";

type TaskListOutput = {
  tasks?: Array<{
    id?: string;
    title?: string;
    completedAt?: string | null;
    key?: string | null;
  }>;
};

export default function TaskListView() {
  const { isSuccess, output } = useToolInfo<{ output: TaskListOutput }>();
  return <TaskListWidget tasks={isSuccess ? output?.tasks : undefined} />;
}
