import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectPicker } from "./ProjectPicker";

const createProject = vi.fn();

vi.mock("@tudu/store", () => ({
  useGetProjectsQuery: () => ({
    data: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "user-1",
        name: "EGS",
        color: "ember",
        archivedAt: null,
        createdAt: "2026-09-11T08:00:00.000Z",
        updatedAt: "2026-09-11T08:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        userId: "user-1",
        name: "Old",
        color: "ink",
        archivedAt: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
      },
    ],
    isLoading: false,
  }),
  useCreateProjectMutation: () => [createProject, { isLoading: false }],
}));

describe("ProjectPicker", () => {
  it("lists live projects and hides archived ones", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ProjectPicker value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Project" }));
    expect(screen.getByText("EGS")).toBeInTheDocument();
    expect(screen.queryByText("Old")).not.toBeInTheDocument();

    await user.click(screen.getByText("EGS"));
    expect(onChange).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });
});
