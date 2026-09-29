import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TaskOrgChip } from "./TaskOrgChip";

describe("TaskOrgChip", () => {
  it("renders org name and color swatch", () => {
    render(
      <TaskOrgChip badge={{ name: "EGSoft", color: "#ec3013" }} />,
    );
    expect(screen.getByText("EGSoft")).toBeInTheDocument();
  });
});
