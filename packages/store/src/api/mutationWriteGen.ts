const writeGeneration = new Map<string, number>();

/** Bump and return the generation for a task or subtask write. */
export function nextWriteGeneration(entityId: string): number {
  const next = (writeGeneration.get(entityId) ?? 0) + 1;
  writeGeneration.set(entityId, next);
  return next;
}

/** True when this write is still the latest for the entity. */
export function isLatestWriteGeneration(
  entityId: string,
  generation: number,
): boolean {
  return writeGeneration.get(entityId) === generation;
}

/** Test helper: reset all generations. */
export function resetWriteGenerations(): void {
  writeGeneration.clear();
}
