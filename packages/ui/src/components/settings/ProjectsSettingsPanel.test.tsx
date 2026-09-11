import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectsSettingsPanel } from "./ProjectsSettingsPanel";

const updateProject = vi.fn();
const deleteProject = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("@tudu/store", () => ({
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
    ],
    isLoading: false,
  }),
  useCreateProjectMutation: () => [vi.fn(), { isLoading: false }],
  useUpdateProjectMutation: () => [updateProject, { isLoading: false }],
  useDeleteProjectMutation: () => [deleteProject, { isLoading: false }],
}));

describe("ProjectsSettingsPanel", () => {
  it("toggles privacy and confirms delete", async () => {
    const user = userEvent.setup();

    render(<ProjectsSettingsPanel />);

    expect(
      screen.getByText(/Private hides the chip from your manager/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Make private" }));
    expect(updateProject).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
      patch: { isPrivate: true },
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      screen.getByText("Tasks stay. The chip comes off."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete project" }));
    expect(deleteProject).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
