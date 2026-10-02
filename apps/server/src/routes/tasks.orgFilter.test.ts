import { describe, expect, it } from "vitest";
import { filterTasksForOrg } from "./tasks.js";

describe("filterTasksForOrg", () => {
  it("keeps personal tasks when orgId is omitted", () => {
    const rows = [
      { id: "1", orgId: null },
      { id: "2", orgId: "org-a" },
    ];
    expect(filterTasksForOrg(rows, undefined).map((row) => row.id)).toEqual([
      "1",
    ]);
  });

  it("filters to the requested org", () => {
    const rows = [
      { id: "1", orgId: null },
      { id: "2", orgId: "org-a" },
    ];
    expect(filterTasksForOrg(rows, "org-a").map((row) => row.id)).toEqual(["2"]);
  });
});
