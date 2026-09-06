import type { SortingStrategy } from "@dnd-kit/sortable";
import type { Lane, Task } from "@tudu/shared";
import { type LaneKey } from "@/lib/reorder";

/** DOM reorder is the preview; sortable transforms would double-shift rows. */
export const noSortingStrategy: SortingStrategy = () => null;

/**
 * Ordered task ids per container. A container is one droppable list: a bucket on
 * the day view, or the single unscheduled list. This map is the only source of
 * truth while a drag is in flight, so the preview and the committed lanes can
 * never disagree.
 */
export type ContainerItems = Record<string, string[]>;

const BUCKET_PREFIX = "bucket-";

export function containerDroppableId(container: string): string {
  return `${BUCKET_PREFIX}${container}`;
}

export function containerFromDroppableId(id: string): string | null {
  return id.startsWith(BUCKET_PREFIX) ? id.slice(BUCKET_PREFIX.length) : null;
}

export function itemsFromTasks(
  tasks: Task[],
  containers: readonly string[],
  containerOf: (task: Task) => string | null,
): ContainerItems {
  const items: ContainerItems = {};
  for (const container of containers) {
    items[container] = [];
  }

  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    const container = containerOf(task);
    if (container !== null && items[container]) {
      items[container].push(task.id);
    }
  }

  return items;
}

export function findContainer(
  items: ContainerItems,
  id: string,
): string | null {
  const fromDroppable = containerFromDroppableId(id);
  if (fromDroppable !== null) {
    return fromDroppable in items ? fromDroppable : null;
  }

  for (const [container, ids] of Object.entries(items)) {
    if (ids.includes(id)) {
      return container;
    }
  }

  return null;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Where `activeId` lands in `ids`, which must already exclude `activeId`. */
function targetIndex(
  ids: string[],
  overId: string,
  insertAfter: boolean,
): number | null {
  if (containerFromDroppableId(overId) !== null) {
    return ids.length;
  }

  const overIndex = ids.indexOf(overId);
  if (overIndex < 0) {
    return null;
  }

  return insertAfter ? overIndex + 1 : overIndex;
}

/**
 * Place `activeId` at the drop position. Handles both a move between containers
 * and a reorder inside one, and returns `items` unchanged when the placement
 * already matches so React can bail out of the render.
 */
export function placeItem(args: {
  items: ContainerItems;
  activeId: string;
  overId: string;
  insertAfter: boolean;
}): ContainerItems {
  const { items, activeId, overId, insertAfter } = args;
  const from = findContainer(items, activeId);
  const to = findContainer(items, overId);
  if (from === null || to === null) {
    return items;
  }

  const withoutActive = items[to].filter((id) => id !== activeId);
  const index = targetIndex(withoutActive, overId, insertAfter);
  if (index === null) {
    return items;
  }

  const nextTo = [...withoutActive];
  nextTo.splice(index, 0, activeId);

  if (from === to) {
    return sameOrder(nextTo, items[to])
      ? items
      : { ...items, [to]: nextTo };
  }

  return {
    ...items,
    [from]: items[from].filter((id) => id !== activeId),
    [to]: nextTo,
  };
}

/** Lanes for every container whose order changed. */
export function lanesFromItems(args: {
  before: ContainerItems;
  after: ContainerItems;
  laneFor: (container: string) => LaneKey;
}): Lane[] {
  const lanes: Lane[] = [];

  for (const [container, ids] of Object.entries(args.after)) {
    if (sameOrder(args.before[container] ?? [], ids)) {
      continue;
    }
    lanes.push({ ...args.laneFor(container), taskIds: ids });
  }

  return lanes;
}

/** Tasks re-placed to match `items`, for the live preview. */
export function tasksFromItems(args: {
  tasks: Task[];
  items: ContainerItems;
  laneFor: (container: string) => LaneKey;
}): Task[] {
  const placementById = new Map<string, LaneKey & { position: number }>();

  for (const [container, ids] of Object.entries(args.items)) {
    const lane = args.laneFor(container);
    ids.forEach((id, index) => {
      placementById.set(id, { ...lane, position: index });
    });
  }

  return args.tasks.map((task) => {
    const placement = placementById.get(task.id);
    return placement ? { ...task, ...placement } : task;
  });
}

export function insertAfterFromPointer(
  pointerY: number,
  overTop: number,
  overHeight: number,
): boolean {
  return pointerY > overTop + overHeight / 2;
}

export type RowRect = { top: number; height: number };

/**
 * When the pointer lands on bucket chrome (header, gaps) rather than a row,
 * pick the row slot from pointer Y against measured row rects.
 */
export function resolveBucketDropTarget(args: {
  taskIds: string[];
  pointerY: number;
  rowRectFor: (id: string) => RowRect | null;
}): { overId: string; insertAfter: boolean } | null {
  const { taskIds, pointerY, rowRectFor } = args;
  if (taskIds.length === 0) {
    return null;
  }

  let sawRect = false;

  for (const id of taskIds) {
    const rect = rowRectFor(id);
    if (!rect) {
      continue;
    }
    sawRect = true;
    if (pointerY < rect.top + rect.height / 2) {
      return { overId: id, insertAfter: false };
    }
  }

  if (!sawRect) {
    return null;
  }

  const lastId = taskIds[taskIds.length - 1]!;
  return { overId: lastId, insertAfter: true };
}

/** Map a bucket hit to a concrete row target using measured rects. */
export function resolvePlacementTarget(args: {
  overId: string;
  insertAfter: boolean;
  items: ContainerItems;
  activeId: string;
  pointerY: number | null;
  rowRectFor: (id: string) => RowRect | null;
}): { overId: string; insertAfter: boolean } {
  const bucket = containerFromDroppableId(args.overId);
  if (bucket === null || args.pointerY === null) {
    return { overId: args.overId, insertAfter: args.insertAfter };
  }

  const taskIds = (args.items[bucket] ?? []).filter((id) => id !== args.activeId);
  const resolved = resolveBucketDropTarget({
    taskIds,
    pointerY: args.pointerY,
    rowRectFor: args.rowRectFor,
  });
  if (!resolved) {
    return { overId: args.overId, insertAfter: false };
  }
  return resolved;
}
