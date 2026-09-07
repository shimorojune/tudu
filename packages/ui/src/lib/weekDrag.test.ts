import { describe, expect, it } from "vitest";
import { containerDroppableId } from "@/lib/dragSort";
import { remapWeekDropTarget } from "@/lib/weekDrag";
import { containerForDayBucket, UNSCHEDULED_CONTAINER } from "@/lib/week";

describe("remapWeekDropTarget", () => {
  const items = {
    [UNSCHEDULED_CONTAINER]: ["u1"],
    [containerForDayBucket("2026-09-01", "now")]: ["t1"],
    [containerForDayBucket("2026-09-01", "later")]: [],
    [containerForDayBucket("2026-09-02", "now")]: [],
    [containerForDayBucket("2026-09-02", "later")]: ["t2"],
  };

  it("forces later when dragging across days", () => {
    const result = remapWeekDropTarget({
      items,
      activeId: "t1",
      overId: containerDroppableId(containerForDayBucket("2026-09-02", "now")),
      insertAfter: false,
    });

    expect(result.overId).toBe("t2");
    expect(result.insertAfter).toBe(true);
  });

  it("forces later when scheduling from unscheduled", () => {
    const result = remapWeekDropTarget({
      items,
      activeId: "u1",
      overId: containerDroppableId(containerForDayBucket("2026-09-01", "now")),
      insertAfter: false,
    });

    expect(result.overId).toBe(
      containerDroppableId(containerForDayBucket("2026-09-01", "later")),
    );
  });
});
