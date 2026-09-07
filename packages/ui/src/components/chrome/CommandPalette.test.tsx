import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStore } from "@tudu/store";
import { Provider } from "react-redux";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CommandPalette } from "./CommandPalette";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

function renderPalette() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <CommandPalette />
    </Provider>,
  );
  return store;
}

async function pressCmdK() {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
      }),
    );
  });
}

async function pressCmdShiftW() {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "w",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );
  });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    navigate.mockReset();
    delete window.__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it("opens and closes with Cmd+K", async () => {
    renderPalette();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await pressCmdK();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await pressCmdK();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes with Esc", async () => {
    const user = userEvent.setup();
    renderPalette();

    await pressCmdK();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("filters commands when typing week", async () => {
    const user = userEvent.setup();
    renderPalette();

    await pressCmdK();
    const input = await screen.findByPlaceholderText("Search commands...");
    await user.type(input, "week");

    expect(screen.getByText("Go to Week")).toBeInTheDocument();
    expect(screen.getByText("Jump to this week")).toBeInTheDocument();
    expect(screen.queryByText("Go to Inbox")).not.toBeInTheDocument();
  });

  it("dispatches requestAddTask for New task", async () => {
    const user = userEvent.setup();
    const store = renderPalette();

    await pressCmdK();
    await user.click(await screen.findByText("New task"));

    expect(store.getState().day.addTaskRequest).toBe(1);
  });

  it("navigates to Unscheduled", async () => {
    const user = userEvent.setup();
    renderPalette();

    await pressCmdK();
    await user.click(await screen.findByText("Go to Unscheduled"));

    expect(navigate).toHaveBeenCalledWith({ to: "/unscheduled" });
  });

  it("ignores Cmd+Shift+W on web", async () => {
    renderPalette();

    await pressCmdShiftW();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("jumps to this week on desktop with Cmd+Shift+W", async () => {
    window.__TAURI_INTERNALS__ = {};
    renderPalette();

    await pressCmdShiftW();

    expect(navigate).toHaveBeenCalledWith({
      to: "/week",
      search: { week: expect.stringMatching(/^\d{4}-W\d{2}$/) },
    });
  });
});
