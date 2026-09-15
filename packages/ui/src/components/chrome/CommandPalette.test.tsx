import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStore } from "@tudu/store";
import { Provider } from "react-redux";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CommandPalette } from "./CommandPalette";
import {
  CommandPaletteProvider,
  useCommandPalette,
} from "./CommandPaletteContext";

function OpenCommandsButton() {
  const { openPalette } = useCommandPalette();
  return (
    <button type="button" aria-label="Commands" onClick={openPalette}>
      Open
    </button>
  );
}

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: (opts?: {
    select?: (state: { location: { pathname: string } }) => unknown;
  }) => {
    const snapshot = { location: { pathname: "/" } };
    return opts?.select ? opts.select(snapshot) : snapshot;
  },
}));

function renderPalette() {
  const store = makeStore();
  render(
    <Provider store={store}>
      <CommandPaletteProvider>
        <OpenCommandsButton />
        <CommandPalette />
      </CommandPaletteProvider>
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

  it("opens with Cmd+K when a closed TipTap search panel is in the document", async () => {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.className = "tiptap-search-replace";
    panel.setAttribute("data-open", "false");
    document.body.append(panel);

    renderPalette();

    await pressCmdK();
    expect(
      await screen.findByPlaceholderText("Search commands..."),
    ).toBeInTheDocument();

    document.body.removeChild(panel);
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

    expect(navigate).toHaveBeenCalledWith({ to: "/unscheduled", search: {} });
  });

  it("ignores Cmd+Shift+W on web", async () => {
    renderPalette();

    await pressCmdShiftW();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens from the commands button", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(screen.getByRole("button", { name: "Commands" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
