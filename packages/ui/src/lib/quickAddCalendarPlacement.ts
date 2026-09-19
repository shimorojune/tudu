export type QuickAddPopoverVariant = "date" | "deadline";

export type QuickAddCalendarPlacement = {
  side: "top" | "bottom";
  align: "start" | "center" | "end";
};

const PADDING = 12;

const POPOVER_WIDTH = 280;

const POPOVER_HEIGHT_DATE = 340;
const POPOVER_HEIGHT_DEADLINE = 380;

function popoverHeight(variant: QuickAddPopoverVariant): number {
  return variant === "deadline" ? POPOVER_HEIGHT_DEADLINE : POPOVER_HEIGHT_DATE;
}

export function measureQuickAddCalendarPlacement(
  trigger: DOMRectReadOnly,
  viewport: { width: number; height: number },
  variant: QuickAddPopoverVariant,
): QuickAddCalendarPlacement {
  const minHeight = popoverHeight(variant) + PADDING;
  const spaceBelow = viewport.height - trigger.bottom - PADDING;
  const spaceAbove = trigger.top - PADDING;

  const side: "top" | "bottom" =
    spaceBelow >= minHeight || spaceBelow >= spaceAbove ? "bottom" : "top";

  const spaceRight = viewport.width - trigger.left - PADDING;
  const spaceLeft = trigger.right - PADDING;

  let align: "start" | "center" | "end" = "center";
  if (spaceRight < POPOVER_WIDTH && spaceLeft >= POPOVER_WIDTH) {
    align = "end";
  } else if (spaceLeft < POPOVER_WIDTH && spaceRight >= POPOVER_WIDTH) {
    align = "start";
  } else if (spaceRight < POPOVER_WIDTH && spaceLeft < POPOVER_WIDTH) {
    align = "center";
  }

  return { side, align };
}
