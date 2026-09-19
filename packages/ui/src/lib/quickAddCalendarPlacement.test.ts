import { describe, expect, it } from "vitest";
import { measureQuickAddCalendarPlacement } from "./quickAddCalendarPlacement";

describe("measureQuickAddCalendarPlacement", () => {
  const viewport = { width: 528, height: 700 };

  it("prefers bottom when there is room below", () => {
    const trigger = {
      top: 200,
      bottom: 230,
      left: 100,
      right: 160,
    } as DOMRectReadOnly;

    expect(measureQuickAddCalendarPlacement(trigger, viewport, "date")).toEqual({
      side: "bottom",
      align: "start",
    });
  });

  it("flips to top near the bottom of the webview", () => {
    const trigger = {
      top: 620,
      bottom: 650,
      left: 100,
      right: 160,
    } as DOMRectReadOnly;

    expect(measureQuickAddCalendarPlacement(trigger, viewport, "date").side).toBe(
      "top",
    );
  });

  it("aligns end when the trigger is on the right edge", () => {
    const trigger = {
      top: 200,
      bottom: 230,
      left: 400,
      right: 460,
    } as DOMRectReadOnly;

    expect(measureQuickAddCalendarPlacement(trigger, viewport, "deadline")).toEqual(
      {
        side: "bottom",
        align: "end",
      },
    );
  });
});
