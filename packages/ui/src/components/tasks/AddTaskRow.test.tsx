import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeStore, requestAddTask } from "@tudu/store";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import { AddTaskRow } from "./AddTaskRow";

describe("AddTaskRow", () => {
  it("submits on Enter and clears the input", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <AddTaskRow onSubmit={onSubmit} />
      </Provider>,
    );

    const input = screen.getByPlaceholderText(
      "Add a task, or paste a JIRA key to link one",
    );
    await user.type(input, "Ship the fix{enter}");

    expect(onSubmit).toHaveBeenCalledWith("Ship the fix");
    expect(input).toHaveValue("");
  });

  it("ignores empty Enter", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <AddTaskRow onSubmit={onSubmit} />
      </Provider>,
    );

    const input = screen.getByPlaceholderText(
      "Add a task, or paste a JIRA key to link one",
    );
    await user.type(input, "   {enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flashes the row when add task is requested", async () => {
    const store = makeStore();

    const { container } = render(
      <Provider store={store}>
        <AddTaskRow onSubmit={vi.fn()} />
      </Provider>,
    );

    store.dispatch(requestAddTask());

    await waitFor(() => {
      expect(container.firstElementChild).toHaveClass("add-task-flash");
    });
  });
});
