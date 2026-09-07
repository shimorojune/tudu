import type { Bucket } from "@tudu/shared";
import { containerDroppableId } from "@/lib/dragSort";
import {
  UNSCHEDULED_CONTAINER,
  containerForDayBucket,
  dayFromContainer,
  parseDayBucketContainer,
} from "@/lib/week";
import { findContainer, type ContainerItems } from "@/lib/dragSort";

export function remapWeekDropTarget(args: {
  items: ContainerItems;
  activeId: string;
  overId: string;
  insertAfter: boolean;
}): { overId: string; insertAfter: boolean } {
  const from = findContainer(args.items, args.activeId);
  const to = findContainer(args.items, args.overId);
  if (!from || !to) {
    return { overId: args.overId, insertAfter: args.insertAfter };
  }

  if (from === to) {
    return { overId: args.overId, insertAfter: args.insertAfter };
  }

  const targetDay = resolveForcedLaterDay(from, to);
  if (!targetDay) {
    return { overId: args.overId, insertAfter: args.insertAfter };
  }

  const laterContainer = containerForDayBucket(targetDay, "later");
  const laterIds = (args.items[laterContainer] ?? []).filter(
    (id) => id !== args.activeId,
  );

  if (laterIds.length === 0) {
    return {
      overId: containerDroppableId(laterContainer),
      insertAfter: false,
    };
  }

  const overInLater = laterIds.includes(args.overId);
  if (overInLater) {
    return { overId: args.overId, insertAfter: args.insertAfter };
  }

  const lastId = laterIds[laterIds.length - 1]!;
  return { overId: lastId, insertAfter: true };
}

function resolveForcedLaterDay(from: string, to: string): string | null {
  if (to === UNSCHEDULED_CONTAINER) {
    return null;
  }

  const toParsed = parseDayBucketContainer(to);
  if (!toParsed) {
    return null;
  }

  if (from === UNSCHEDULED_CONTAINER) {
    return toParsed.date;
  }

  const fromDay = dayFromContainer(from);
  if (!fromDay || fromDay === toParsed.date) {
    return null;
  }

  return toParsed.date;
}

export function weekLaneFor(container: string): {
  scheduledDate: string | null;
  bucket: Bucket | null;
} {
  if (container === UNSCHEDULED_CONTAINER) {
    return { scheduledDate: null, bucket: null };
  }
  const parsed = parseDayBucketContainer(container);
  if (!parsed) {
    throw new Error(`Unknown week container: ${container}`);
  }
  return { scheduledDate: parsed.date, bucket: parsed.bucket };
}
