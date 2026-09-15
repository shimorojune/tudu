import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutationResult, notifyAction } from "./notifyAction";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast,
}));

describe("notifyAction", () => {
  beforeEach(() => {
    toast.success.mockReset();
    toast.error.mockReset();
  });

  it("toasts success after the work resolves", async () => {
    await expect(
      notifyAction(async () => "ok", {
        success: "Saved",
        error: "Could not save",
      }),
    ).resolves.toBe("ok");
    expect(toast.success).toHaveBeenCalledWith("Saved");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts the server error and rethrows", async () => {
    await expect(
      notifyAction(
        async () => {
          throw { data: { error: "Jira issue is not visible" } };
        },
        { success: "Saved", error: "Could not save" },
      ),
    ).rejects.toEqual({ data: { error: "Jira issue is not visible" } });
    expect(toast.error).toHaveBeenCalledWith("Jira issue is not visible");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("mutationResult", () => {
  it("unwraps RTK Query results", async () => {
    await expect(
      mutationResult({ unwrap: () => Promise.resolve("saved") }),
    ).resolves.toBe("saved");
  });

  it("resolves mocks that have no unwrap", async () => {
    await expect(mutationResult(undefined)).resolves.toBeUndefined();
  });
});

