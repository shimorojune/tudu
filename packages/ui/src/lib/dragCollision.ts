import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  containerFromDroppableId,
  insertAfterFromPointer,
} from "@/lib/dragSort";

/**
 * Prefer the row under the pointer, fall back to the bucket itself so empty
 * buckets stay droppable, and fall back to corners once the pointer leaves
 * every droppable (keyboard drags included). Never return the dragged row:
 * its invisible slot follows the pointer and would dead-end placement.
 */
export const taskCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const hits = pointerHits.length > 0 ? pointerHits : closestCorners(args);
  const rows = hits.filter(
    (hit) =>
      containerFromDroppableId(String(hit.id)) === null &&
      hit.id !== args.active.id,
  );

  if (rows.length > 0) {
    return rows;
  }

  const buckets = hits.filter(
    (hit) => containerFromDroppableId(String(hit.id)) !== null,
  );
  if (buckets.length > 0) {
    return buckets;
  }

  return hits;
};

/** Pointer Y in viewport coordinates, or null for keyboard drags. */
export function pointerYFromEvent(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
  livePointerY?: number | null,
): number | null {
  if (livePointerY != null) {
    return livePointerY;
  }

  const activator = event.activatorEvent;
  if (typeof MouseEvent !== "undefined" && activator instanceof MouseEvent) {
    return activator.clientY + event.delta.y;
  }

  if (typeof PointerEvent !== "undefined" && activator instanceof PointerEvent) {
    return activator.clientY + event.delta.y;
  }

  const translated = event.active.rect.current.translated;
  if (!translated) {
    return null;
  }

  return translated.top + translated.height / 2;
}

/** True when the pointer sits past the middle of the row it is over. */
export function insertAfterFromEvent(
  event: DragMoveEvent | DragOverEvent | DragEndEvent,
  livePointerY?: number | null,
): boolean {
  const over = event.over;
  if (!over) {
    return false;
  }

  const pointerY = pointerYFromEvent(event, livePointerY);
  if (pointerY !== null) {
    return insertAfterFromPointer(pointerY, over.rect.top, over.rect.height);
  }

  return false;
}
