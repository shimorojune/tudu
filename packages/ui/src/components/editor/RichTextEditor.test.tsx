import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("persists html formatting in html mode", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RichTextEditor
        mode="html"
        value=""
        aria-label="Task description"
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Task description" })).toBeInTheDocument();
    });

    await user.type(screen.getByRole("textbox", { name: "Task description" }), "Hello");

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain("<p>Hello</p>");
  });

  it("loads Jira wiki into the editor surface", async () => {
    render(
      <RichTextEditor
        mode="jiraWiki"
        value="Existing *note*"
        aria-label="Jira description"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Jira description" })).toBeInTheDocument();
    });
  });

  it("shows Tiptap formatting toolbar for rich text editing", async () => {
    render(
      <RichTextEditor
        mode="jiraWiki"
        value="Existing note"
        aria-label="Jira description"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tiptap-toolbar")).toBeInTheDocument();
    });
  });

  it("falls back to raw wiki text for unsupported Jira markup", () => {
    render(
      <RichTextEditor
        mode="jiraWiki"
        value="{panel}Keep raw{panel}"
        aria-label="Jira description"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Showing raw Jira wiki text.")).toBeInTheDocument();
    expect(screen.getByLabelText("Jira description")).toHaveValue("{panel}Keep raw{panel}");
  });
});
