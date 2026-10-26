import { useEffect, useRef } from 'react';

/**
 * Tell the page an open task's ref once, when the panel has it (a task written a moment ago gets it from the server;
 * a task opened before has it at once). Once per open task, however often the page re-renders: the page answers by
 * changing the address, and calling again while that is still on its way starts the change over, forever.
 */
export function useRefOnce(
  open: { id: string } | null,
  detail: { id: string; ref: string | null } | undefined,
  onRef: ((ref: string) => void) | undefined,
): void {
  const told = useRef<string | null>(null);
  const ref = detail?.ref ?? null;
  const detailId = detail?.id;
  useEffect(() => {
    if (!open) {
      told.current = null;
      return;
    }
    if (!ref || detailId !== open.id) return;
    const k = `${open.id}:${ref}`;
    if (told.current === k) return;
    told.current = k;
    onRef?.(ref);
  }, [open, ref, detailId, onRef]);
}
