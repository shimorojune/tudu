import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEffectiveOrgSlug } from "./useSpaceContext";

const mockState = {
  space: { current: { kind: "org" as const, orgId: "o1", slug: "acme" } },
};

vi.mock("react-redux", () => ({
  useSelector: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
  useDispatch: () => vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (s: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/settings" } }),
}));

vi.mock("@tudu/store", () => ({
  useListSpacesQuery: () => ({ data: { spaces: [] } }),
  setCurrentSpace: vi.fn(),
}));

describe("useEffectiveOrgSlug", () => {
  it("keeps org slug on space-neutral settings route", () => {
    const { result } = renderHook(() => useEffectiveOrgSlug());
    expect(result.current).toBe("acme");
  });
});
