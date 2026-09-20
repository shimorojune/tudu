import type { QuickAddPopoverVariant } from "@/lib/quickAddCalendarPlacement";

/** Keep in sync with apps/desktop/src-tauri/src/quick_add.rs and tauri.conf.json quick-add height. */
export const QUICK_ADD_WINDOW_WIDTH = 590;
export const QUICK_ADD_COMPACT_HEIGHT = 320;
export const QUICK_ADD_EXPANDED_HEIGHT_DATE = 640;
export const QUICK_ADD_EXPANDED_HEIGHT_DEADLINE = 700;
/** @deprecated Use QUICK_ADD_EXPANDED_HEIGHT_DATE */
export const QUICK_ADD_EXPANDED_HEIGHT = QUICK_ADD_EXPANDED_HEIGHT_DATE;

let openPopoverCount = 0;
const openVariants = new Set<QuickAddPopoverVariant>();

function expandedHeightForOpenPopovers(): number {
  if (openVariants.has("deadline")) {
    return QUICK_ADD_EXPANDED_HEIGHT_DEADLINE;
  }
  if (openVariants.has("date")) {
    return QUICK_ADD_EXPANDED_HEIGHT_DATE;
  }
  return QUICK_ADD_EXPANDED_HEIGHT_DATE;
}

async function applyQuickAddHeight(height: number): Promise<void> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("resize_quick_add_window", {
      width: QUICK_ADD_WINDOW_WIDTH,
      height,
    });
  } catch {
    // Web dev shell or non-Tauri: no-op.
  }
}

export type QuickAddPopoverOpenOptions = {
  variant?: QuickAddPopoverVariant;
};

export async function notifyQuickAddPopoverOpen(
  open: boolean,
  options?: QuickAddPopoverOpenOptions,
): Promise<void> {
  const variant = options?.variant ?? "date";

  if (open) {
    openPopoverCount += 1;
    openVariants.add(variant);
  } else {
    openPopoverCount = Math.max(0, openPopoverCount - 1);
    openVariants.delete(variant);
    if (openPopoverCount === 0) {
      openVariants.clear();
    }
  }

  const height =
    openPopoverCount > 0
      ? expandedHeightForOpenPopovers()
      : QUICK_ADD_COMPACT_HEIGHT;
  await applyQuickAddHeight(height);
}

export async function resetQuickAddWindowHeight(): Promise<void> {
  openPopoverCount = 0;
  openVariants.clear();
  await applyQuickAddHeight(QUICK_ADD_COMPACT_HEIGHT);
}
