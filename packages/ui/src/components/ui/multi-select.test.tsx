import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MultiSelect } from "./multi-select";

function Harness() {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiSelect
      aria-label="Components"
      values={values}
      onChange={setValues}
      placeholder="All Components"
      searchPlaceholder="Search Components"
      options={[
        { value: "20001", label: "Knowledge Base" },
        { value: "20002", label: "Agent Console" },
      ]}
    />
  );
}

describe("MultiSelect", () => {
  it("selects multiple options from a searchable list", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Components" }));
    await user.click(screen.getByText("Knowledge Base"));
    await user.click(screen.getByText("Agent Console"));

    expect(screen.getByRole("button", { name: "Components" })).toHaveTextContent(
      "2 selected",
    );
  });

  it("keeps the chevron aligned to the trigger edge", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Components" });
    const chevron = trigger.querySelector("svg");
    expect(chevron).toBeTruthy();
    expect(trigger.lastElementChild).toBe(chevron);
  });
});
