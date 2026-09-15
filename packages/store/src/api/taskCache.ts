import type {
  Bucket,
  CreateSubtaskRequest,
  CreateTaskRequest,
  Lane,
  Subtask,
  Task,
  UpdateTaskRequest,
} from "@tudu/shared";
import type { AppDispatch, RootState } from "../store.js";
import { baseApi } from "./baseApi.js";
import { managerApi } from "./managerApi.js";
import { tasksApi } from "./tasksApi.js";

type TaskQueryEntry = {
  endpointName?: string;
  originalArgs?: unknown;
  status?: string;
};

function applyLanesToTasks(tasks: Task[], lanes: Lane[]): Task[] {
  const placementById = new Map<
    string,
    { scheduledDate: string | null; bucket: Bucket | null; position: number }
  >();

  for (const lane of lanes) {
    lane.taskIds.forEach((taskId, index) => {
      placementById.set(taskId, {
        scheduledDate: lane.scheduledDate,
        bucket: lane.bucket,
        position: index,
      });
    });
  }

  return tasks.map((task) => {
    const placement = placementById.get(task.id);
    if (!placement) {
      return task;
    }
    return {
      ...task,
      scheduledDate: placement.scheduledDate,
      bucket: placement.bucket,
      position: placement.position,
    };
  });
}

type CachePatch = { undo: () => void };

export function syncTaskToDayCache(
  tasks: Task[],
  task: Task,
  date: string,
): Task[] {
  const index = tasks.findIndex((entry) => entry.id === task.id);
  if (task.scheduledDate === date) {
    const next =
      index === -1
        ? [...tasks, task]
        : tasks.map((entry) => (entry.id === task.id ? task : entry));
    return [...next].sort((a, b) => a.position - b.position);
  }
  if (index === -1) {
    return tasks;
  }
  return tasks.filter((entry) => entry.id !== task.id);
}

export function syncTaskToUnscheduledCache(tasks: Task[], task: Task): Task[] {
  const index = tasks.findIndex((entry) => entry.id === task.id);
  if (task.scheduledDate === null) {
    const next =
      index === -1
        ? [...tasks, task]
        : tasks.map((entry) => (entry.id === task.id ? task : entry));
    return [...next].sort((a, b) => a.position - b.position);
  }
  if (index === -1) {
    return tasks;
  }
  return tasks.filter((entry) => entry.id !== task.id);
}

export function patchAllTaskCaches(
  dispatch: AppDispatch,
  getState: () => RootState,
  updater: (tasks: Task[]) => Task[],
): CachePatch[] {
  const patches: CachePatch[] = [];
  const apiState = getState()[baseApi.reducerPath] as {
    queries: Record<string, TaskQueryEntry | undefined>;
  };

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || entry.status !== "fulfilled") {
      continue;
    }

    if (entry.endpointName === "getTasksForDay") {
      const date = entry.originalArgs as string;
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getTasksForDay", date, (draft) => {
            draft.tasks = updater(draft.tasks);
          }),
        ),
      );
    }

    if (entry.endpointName === "getUnscheduledTasks") {
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData(
            "getUnscheduledTasks",
            undefined,
            (draft) => {
              draft.tasks = updater(draft.tasks);
            },
          ),
        ),
      );
    }

    if (entry.endpointName === "getReportDay") {
      const args = entry.originalArgs as { userId: string; date: string };
      patches.push(
        dispatch(
          managerApi.util.updateQueryData("getReportDay", args, (draft) => {
            draft.tasks = updater(draft.tasks);
          }),
        ),
      );
    }
  }

  return patches;
}

export function appendOptimisticSubtask(
  task: Task,
  body: CreateSubtaskRequest,
  tempId: string,
): Task {
  const now = new Date().toISOString();
  const position =
    task.subtasks.length > 0
      ? Math.max(...task.subtasks.map((subtask) => subtask.position)) + 1
      : 0;
  const optimistic: Subtask = {
    id: tempId,
    taskId: task.id,
    title: body.title,
    done: false,
    position,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...task,
    subtasks: [...task.subtasks, optimistic],
    updatedAt: now,
  };
}

function laneSiblings(tasks: Task[], task: Task): Task[] {
  return tasks.filter(
    (entry) =>
      entry.id !== task.id &&
      entry.scheduledDate === task.scheduledDate &&
      entry.bucket === task.bucket,
  );
}

function nextLanePosition(tasks: Task[], task: Task): number {
  const siblings = laneSiblings(tasks, task);
  if (siblings.length === 0) {
    return task.position;
  }
  const maxPosition = Math.max(...siblings.map((entry) => entry.position));
  if (task.position >= maxPosition) {
    return task.position;
  }
  return maxPosition + 1;
}

export function mergeTaskPatch(
  task: Task,
  patch: UpdateTaskRequest,
  siblingTasks?: Task[],
): Task {
  const { completed, inProgress: patchInProgress, ...rest } = patch;
  const next = { ...task, ...rest, updatedAt: new Date().toISOString() };

  if ("completed" in patch) {
    const completing = completed === true;
    next.completedAt = completing ? new Date().toISOString() : null;
    if (completing) {
      next.inProgress = false;
      if (siblingTasks) {
        next.position = nextLanePosition(siblingTasks, task);
      }
    }
  }

  if ("inProgress" in patch && next.completedAt === null) {
    next.inProgress = patchInProgress ?? false;
  }

  return next;
}

export function reorderSubtasksInTask(task: Task, subtaskIds: string[]): Task {
  const byId = new Map(task.subtasks.map((subtask) => [subtask.id, subtask]));
  const reordered = subtaskIds
    .map((id, index) => {
      const subtask = byId.get(id);
      if (!subtask) {
        return null;
      }
      return { ...subtask, position: index };
    })
    .filter((subtask): subtask is Subtask => subtask !== null);

  return {
    ...task,
    subtasks: reordered,
    updatedAt: new Date().toISOString(),
  };
}

export function createOptimisticTask(body: CreateTaskRequest, tempId: string): Task {
  const now = new Date().toISOString();
  return {
    id: tempId,
    title: body.title,
    description: null,
    scheduledDate: body.scheduledDate ?? null,
    bucket: body.bucket ?? null,
    position: 9999,
    startDate: body.startDate ?? null,
    deadline: body.deadline ?? null,
    completedAt: null,
    inProgress: false,
    carriedDays: 0,
    carriedSince: null,
    isPrivate: body.isPrivate ?? false,
    createdAt: now,
    updatedAt: now,
    subtasks: [],
    commentCount: 0,
    project: null,
    jiraLinks: [],
  };
}

export function applyReorderOptimistic(
  dispatch: AppDispatch,
  getState: () => RootState,
  lanes: Lane[],
): CachePatch[] {
  const taskById = new Map<string, Task>();

  const apiState = getState()[baseApi.reducerPath] as {
    queries: Record<string, TaskQueryEntry | undefined>;
  };

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || entry.status !== "fulfilled") {
      continue;
    }

    if (entry.endpointName === "getTasksForDay") {
      const date = entry.originalArgs as string;
      const data = tasksApi.endpoints.getTasksForDay.select(date)(getState()).data;
      for (const task of data?.tasks ?? []) {
        taskById.set(task.id, task);
      }
    }

    if (entry.endpointName === "getUnscheduledTasks") {
      const data = tasksApi.endpoints.getUnscheduledTasks.select(undefined)(
        getState(),
      ).data;
      for (const task of data?.tasks ?? []) {
        taskById.set(task.id, task);
      }
    }
  }

  const allTasks = applyLanesToTasks([...taskById.values()], lanes);
  const allById = new Map(allTasks.map((task) => [task.id, task]));

  const patches: CachePatch[] = [];

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || entry.status !== "fulfilled") {
      continue;
    }

    if (entry.endpointName === "getTasksForDay") {
      const date = entry.originalArgs as string;
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getTasksForDay", date, (draft) => {
            const kept = draft.tasks
              .filter((task) => {
                const updated = allById.get(task.id);
                return updated?.scheduledDate === date;
              })
              .map((task) => allById.get(task.id)!);

            const incoming = allTasks.filter(
              (task) =>
                task.scheduledDate === date &&
                !kept.some((existing) => existing.id === task.id),
            );

            draft.tasks = [...kept, ...incoming].sort(
              (a, b) => a.position - b.position,
            );
          }),
        ),
      );
    }

    if (entry.endpointName === "getUnscheduledTasks") {
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData(
            "getUnscheduledTasks",
            undefined,
            (draft) => {
              draft.tasks = allTasks
                .filter((task) => task.scheduledDate === null)
                .sort((a, b) => a.position - b.position);
            },
          ),
        ),
      );
    }
  }

  return patches;
}

export function replaceTaskInCaches(
  dispatch: AppDispatch,
  getState: () => RootState,
  task: Task,
): CachePatch[] {
  const patches: CachePatch[] = [];
  const apiState = getState()[baseApi.reducerPath] as {
    queries: Record<string, TaskQueryEntry | undefined>;
  };

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || entry.status !== "fulfilled") {
      continue;
    }

    if (entry.endpointName === "getTasksForDay") {
      const date = entry.originalArgs as string;
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getTasksForDay", date, (draft) => {
            draft.tasks = syncTaskToDayCache(draft.tasks, task, date);
          }),
        ),
      );
    }

    if (entry.endpointName === "getUnscheduledTasks") {
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData(
            "getUnscheduledTasks",
            undefined,
            (draft) => {
              draft.tasks = syncTaskToUnscheduledCache(draft.tasks, task);
            },
          ),
        ),
      );
    }
  }

  return patches;
}

export function removeTaskFromCaches(
  dispatch: AppDispatch,
  getState: () => RootState,
  taskId: string,
): CachePatch[] {
  return patchAllTaskCaches(dispatch, getState, (tasks) =>
    tasks.filter((task) => task.id !== taskId),
  );
}

export function upsertTaskInCaches(
  dispatch: AppDispatch,
  getState: () => RootState,
  task: Task,
): CachePatch[] {
  const patches: CachePatch[] = [];
  const apiState = getState()[baseApi.reducerPath] as {
    queries: Record<string, TaskQueryEntry | undefined>;
  };

  for (const entry of Object.values(apiState.queries)) {
    if (!entry?.endpointName || entry.status !== "fulfilled") {
      continue;
    }

    if (
      entry.endpointName === "getTasksForDay" &&
      task.scheduledDate === entry.originalArgs
    ) {
      const date = entry.originalArgs as string;
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData("getTasksForDay", date, (draft) => {
            const index = draft.tasks.findIndex((entry) => entry.id === task.id);
            if (index === -1) {
              draft.tasks.push(task);
            } else {
              draft.tasks[index] = task;
            }
            draft.tasks.sort((a, b) => a.position - b.position);
          }),
        ),
      );
    }

    if (entry.endpointName === "getUnscheduledTasks" && task.scheduledDate === null) {
      patches.push(
        dispatch(
          tasksApi.util.updateQueryData(
            "getUnscheduledTasks",
            undefined,
            (draft) => {
              const index = draft.tasks.findIndex((entry) => entry.id === task.id);
              if (index === -1) {
                draft.tasks.push(task);
              } else {
                draft.tasks[index] = task;
              }
              draft.tasks.sort((a, b) => a.position - b.position);
            },
          ),
        ),
      );
    }
  }

  return patches;
}
