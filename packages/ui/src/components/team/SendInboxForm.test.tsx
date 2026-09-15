import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SendInboxForm } from "./SendInboxForm";

const createReportProject = vi.hoisted(() => vi.fn());
const sendTask = vi.hoisted(() => vi.fn());

vi.mock("@tudu/store", () => ({
  useCreateReportProjectMutation: () => [createReportProject, { isLoading: false }],
  useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  useGetProjectsQuery: () => ({ data: [], isLoading: false }),
  useGetReportProjectsQuery: () => ({ data: [], isLoading: false }),
  useSendInboxTaskMutation: () => [sendTask, { isLoading: false }],
}));

describe("SendInboxForm", () => {
  it("names text fields for browser form diagnostics", () => {
    render(
      <SendInboxForm
        userId="report-1"
        reportName="Priya Raman"
      />,
    );

    expect(screen.getByLabelText("Task")).toHaveAttribute(
      "name",
      "inbox-task-title",
    );
    expect(screen.getByLabelText("Note")).toHaveAttribute(
      "name",
      "inbox-task-note",
    );
  });
});
