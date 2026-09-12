import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { hydrateDay, makeStore } from "@tudu/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DAY_TASK_TAB_FIELDS } from "@/lib/daySearch";
import { useDaySearchSync } from "./useDaySearchSync";

const navigate = vi.hoisted(() => vi.fn());
const searchState = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  searchStr: "",
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => searchState.search,
  useRouterState: (opts?: {
    select?: (state: {
      location: { search: Record<string, unknown>; searchStr: string };
    }) => unknown;
  }) => {
    const snapshot = {
      location: { search: searchState.search, searchStr: searchState.searchStr },
    };
    return opts?.select ? opts.select(snapshot) : snapshot;
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function Probe({ taskFound }: { taskFound?: boolean | null }) {
  useDaySearchSync(DAY_TASK_TAB_FIELDS, { taskFound: taskFound ?? null });
  return null;
}

describe("useDaySearchSync", () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.mocked(toast.error).mockReset();
    searchState.search = {};
    searchState.searchStr = "";
  });

  it("toasts once for a junk date and replaces the URL", () => {
    searchState.searchStr = "?date=banana";
    render(
      <Provider store={makeStore()}>
        <Probe />
      </Provider>,
    );

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "That date is not valid. Opened today instead.",
    );
    expect(navigate).toHaveBeenCalled();
    const call = navigate.mock.calls[0][0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };
    expect(call.replace).toBe(true);
    expect(call.search({ date: "banana" })).toEqual({});
  });

  it("does not strip a deep link when only taskFound flips", () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    searchState.search = { task: taskId, tab: "comments" };
    searchState.searchStr = `?task=${taskId}&tab=comments`;
    const store = makeStore();
    const { rerender } = render(
      <Provider store={store}>
        <Probe taskFound={null} />
      </Provider>,
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().day.selectedTaskId).toBe(taskId);
    expect(store.getState().day.inspectorTab).toBe("comments");

    rerender(
      <Provider store={store}>
        <Probe taskFound={true} />
      </Provider>,
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(store.getState().day.selectedTaskId).toBe(taskId);
  });

  it("toasts when a real task id is not on the list", () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const store = makeStore();
    store.dispatch(hydrateDay({ taskId }));
    searchState.search = { task: taskId };
    searchState.searchStr = `?task=${taskId}`;

    render(
      <Provider store={store}>
        <Probe taskFound={false} />
      </Provider>,
    );

    expect(toast.error).toHaveBeenCalledWith("Could not open that task.");
    expect(store.getState().day.selectedTaskId).toBeNull();
  });
});
