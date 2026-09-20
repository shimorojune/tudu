import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { ProjectsSettingsPanel } from "./ProjectsSettingsPanel";

const updateProject = vi.fn();
const deleteProject = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("react-redux", () => ({
  useSelector: () => ({ tasks: {} }),
}));

vi.mock("@tudu/store", () => ({
  selectVisible: () => ({ tasks: {} }),
  useGetProjectsQuery: () => ({
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        name: "EGS",
        color: "ember",
        archivedAt: null,
        isPrivate: false,
        createdAt: "2026-09-11T08:00:00.000Z",
        updatedAt: "2026-09-11T08:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        userId: "user-1",
        name: "Kitchen",
        color: "ember",
        archivedAt: "2026-09-01T00:00:00.000Z",
        isPrivate: false,
        createdAt: "2026-09-11T08:00:00.000Z",
        updatedAt: "2026-09-11T08:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
  useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateProjectMutation: () => [updateProject, { isLoading: false }],
  useDeleteProjectMutation: () => [deleteProject, { isLoading: false }],
}));

describe("ProjectsSettingsPanel", () => {
  it("shows C3d copy and archive-gated delete", async () => {
    const user = userEvent.setup();

    render(<ProjectsSettingsPanel />);

    expect(
      screen.getByText(/private hides it from your manager/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only archived projects can be deleted/),
    ).toBeInTheDocument();
    expect(screen.getByText("In the pickers")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("EGS")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();

    const activeRow = screen.getByText("EGS").closest("li");
    expect(activeRow).toBeTruthy();
    await user.hover(activeRow!);

    await user.click(screen.getByRole("button", { name: "Make private" }));
    expect(updateProject).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      patch: { isPrivate: true },
    });
  });

  it("does not show delete on active projects in the pickers list", () => {
    render(<ProjectsSettingsPanel />);

    const egsRow = screen.getByText("EGS").closest("li");
    expect(egsRow?.textContent).not.toMatch(/Delete/);
  });
});
