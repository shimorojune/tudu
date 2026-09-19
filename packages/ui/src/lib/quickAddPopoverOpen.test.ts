import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { bindQuickAddPopoverOpenChange } from "./quickAddPopoverOpen";

const notifyQuickAddPopoverOpen = vi.fn();

vi.mock("@/lib/quickAddWindowResize", () => ({
  notifyQuickAddPopoverOpen: (...args: unknown[]) =>
    notifyQuickAddPopoverOpen(...args),
}));

describe("bindQuickAddPopoverOpenChange", () => {
  beforeEach(() => {
    notifyQuickAddPopoverOpen.mockReset();
    notifyQuickAddPopoverOpen.mockResolvedValue(undefined);
  });

  it("opens only after resize when quickAddShell is true", async () => {
    const opens: boolean[] = [];
    const setOpen = (next: boolean) => {
      opens.push(next);
    };
    const onChange = bindQuickAddPopoverOpenChange(true, setOpen, {
      variant: "date",
    });

    onChange(true);
    expect(opens).toEqual([]);
    expect(notifyQuickAddPopoverOpen).toHaveBeenCalledWith(true, {
      variant: "date",
    });

    await waitFor(() => {
      expect(opens).toEqual([true]);
    });
  });

  it("closes immediately and compacts when quickAddShell is true", () => {
    const opens: boolean[] = [];
    const setOpen = (next: boolean) => {
      opens.push(next);
    };
    const onChange = bindQuickAddPopoverOpenChange(true, setOpen, {
      variant: "deadline",
    });

    onChange(false);
    expect(opens).toEqual([false]);
    expect(notifyQuickAddPopoverOpen).toHaveBeenCalledWith(false, {
      variant: "deadline",
    });
  });

  it("passes through when not quickAddShell", () => {
    const opens: boolean[] = [];
    const setOpen = (next: boolean) => {
      opens.push(next);
    };
    const onChange = bindQuickAddPopoverOpenChange(false, setOpen);

    onChange(true);
    expect(opens).toEqual([true]);
    expect(notifyQuickAddPopoverOpen).not.toHaveBeenCalled();
  });
});
