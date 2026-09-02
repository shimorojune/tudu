import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface TaskListProps {
  date: string;
  tasks: Task[];
  loading: boolean;
  onChange: () => void;
}

export function TaskList({ date, tasks, loading, onChange }: TaskListProps) {
  const [text, setText] = useState("");
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const parents = tasks.filter((t) => !t.parentId);
  const childrenByParent = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    if (task.parentId) {
      acc[task.parentId] = acc[task.parentId] ?? [];
      acc[task.parentId].push(task);
    }
    return acc;
  }, {});

  async function addTask(parentId?: string) {
    const value = parentId ? subtaskDrafts[parentId]?.trim() : text.trim();
    if (!value) return;

    await api.addTask({ text: value, date, parentId: parentId ?? null });
    if (parentId) {
      setSubtaskDrafts((prev) => ({ ...prev, [parentId]: "" }));
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
    } else {
      setText("");
    }
    onChange();
  }

  async function toggleTask(id: string) {
    await api.toggleTask(id);
    onChange();
  }

  async function deleteTask(id: string) {
    await api.deleteTask(id);
    onChange();
  }

  return (
    <Card className="flex min-h-0 flex-col shadow-sm">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base font-semibold">My Tasks</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addTask();
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a task..."
            className="bg-background"
          />
          <Button type="submit" size="icon" aria-label="Add task">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        <ScrollArea className="min-h-0 flex-1 pr-2">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          ) : parents.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              No tasks yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border">
              {parents.map((task) => {
                const subtasks = childrenByParent[task.id] ?? [];
                const isExpanded = expanded[task.id] ?? subtasks.length > 0;

                return (
                  <li key={task.id}>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Checkbox
                        checked={task.done}
                        onCheckedChange={() => void toggleTask(task.id)}
                      />
                      <button
                        type="button"
                        className="text-muted-foreground"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [task.id]: !isExpanded }))
                        }
                        aria-label={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <p
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          task.done && "text-muted-foreground line-through",
                        )}
                      >
                        {task.text}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => void deleteTask(task.id)}
                        aria-label="Delete task"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="border-t bg-muted/20 pb-2">
                        {subtasks.map((subtask) => (
                          <div
                            key={subtask.id}
                            className="flex items-center gap-3 border-b border-border/60 px-3 py-2 pl-10 last:border-b-0"
                          >
                            <Checkbox
                              checked={subtask.done}
                              onCheckedChange={() => void toggleTask(subtask.id)}
                            />
                            <p
                              className={cn(
                                "min-w-0 flex-1 text-sm",
                                subtask.done && "text-muted-foreground line-through",
                              )}
                            >
                              {subtask.text}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              onClick={() => void deleteTask(subtask.id)}
                              aria-label="Delete subtask"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <form
                          className="flex gap-2 px-3 pt-2 pl-10"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void addTask(task.id);
                          }}
                        >
                          <Input
                            value={subtaskDrafts[task.id] ?? ""}
                            onChange={(e) =>
                              setSubtaskDrafts((prev) => ({
                                ...prev,
                                [task.id]: e.target.value,
                              }))
                            }
                            placeholder="Add subtask..."
                            className="h-8 bg-background"
                          />
                          <Button type="submit" size="sm" variant="secondary">
                            Add
                          </Button>
                        </form>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
