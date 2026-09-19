import {
  measureQuickAddCalendarPlacement,
  type QuickAddCalendarPlacement,
  type QuickAddPopoverVariant,
} from "@/lib/quickAddCalendarPlacement";
import {
  notifyQuickAddPopoverOpen,
  type QuickAddPopoverOpenOptions,
} from "@/lib/quickAddWindowResize";

function afterQuickAddLayout(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

export async function prepareQuickAddPopoverOpen(
  variant: QuickAddPopoverVariant,
  trigger: HTMLElement | null,
): Promise<QuickAddCalendarPlacement | null> {
  await notifyQuickAddPopoverOpen(true, { variant });
  await afterQuickAddLayout();
  if (!trigger) {
    return null;
  }
  return measureQuickAddCalendarPlacement(
    trigger.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight },
    variant,
  );
}

export function bindQuickAddPopoverOpenChange(
  quickAddShell: boolean,
  setOpen: (open: boolean) => void,
  options?: {
    variant?: QuickAddPopoverVariant;
    getTrigger?: () => HTMLElement | null;
    onPlacement?: (placement: QuickAddCalendarPlacement) => void;
  },
): (next: boolean) => void {
  const variant = options?.variant ?? "date";

  return (next: boolean) => {
    if (!quickAddShell) {
      setOpen(next);
      return;
    }
    if (next) {
      void prepareQuickAddPopoverOpen(
        variant,
        options?.getTrigger?.() ?? null,
      ).then((placement) => {
        if (placement && options?.onPlacement) {
          options.onPlacement(placement);
        }
        setOpen(true);
      });
      return;
    }
    setOpen(false);
    void notifyQuickAddPopoverOpen(false, { variant });
  };
}

export type { QuickAddPopoverOpenOptions };
