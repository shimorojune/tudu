import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDescriptionField } from "./TaskDescriptionField";

vi.mock("@tudu/store", () => ({
  useUpdateTaskMutation: () => [vi.fn()],
  useUploadTaskAttachmentMutation: () => [vi.fn()],
}));

describe("TaskDescriptionField", () => {
  it("names the textarea for browser form diagnostics", () => {
    render(
      <TaskDescriptionField
        taskId="11111111-1111-4111-8111-111111111111"
        description="Existing note"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Task description" })).toBeInTheDocument();
  });
});
