import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSpaceShortcuts } from "./useSpaceShortcuts";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@tudu/store", () => ({
  useListSpacesQuery: () => ({
    data: {
      spaces: [
        { kind: "personal", name: "Personal" },
        { kind: "org", name: "Acme", slug: "acme", orgId: "o1" },
      ],
    },
  }),
}));

describe("useSpaceShortcuts", () => {
  it("registers a keydown listener", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useSpaceShortcuts());
    expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    addSpy.mockRestore();
  });
});
