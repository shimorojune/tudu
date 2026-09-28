/** Reorder only visible ids while hidden ids keep their slot positions. */
export function reorderWithinSubset(
  fullOrderIds: string[],
  subsetNewOrderIds: string[],
): string[] {
  const fullSet = new Set(fullOrderIds);
  for (const id of subsetNewOrderIds) {
    if (!fullSet.has(id)) {
      throw new Error(`Unknown task id: ${id}`);
    }
  }
  const subsetSet = new Set(subsetNewOrderIds);
  if (subsetSet.size !== subsetNewOrderIds.length) {
    throw new Error("Duplicate task id in subset");
  }

  const hiddenSlots: { index: number; id: string }[] = [];
  const visibleSlots: number[] = [];

  fullOrderIds.forEach((id, index) => {
    if (subsetSet.has(id)) {
      visibleSlots.push(index);
    } else {
      hiddenSlots.push({ index, id });
    }
  });

  if (subsetNewOrderIds.length !== visibleSlots.length) {
    throw new Error("Subset size does not match visible tasks");
  }

  const result = [...fullOrderIds];
  subsetNewOrderIds.forEach((id, i) => {
    result[visibleSlots[i]!] = id;
  });
  for (const { index, id } of hiddenSlots) {
    result[index] = id;
  }
  return result;
}
