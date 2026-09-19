import { describe, expect, it, vi } from "vitest";
import type { TypeSafeClient } from "@typesafe-ai/sdk";

vi.mock("@tudu/db", () => ({
  listProjectsForUser: vi.fn(),
}));

import { listProjectsForUser } from "@tudu/db";
import { runQuickAddSuggest } from "./suggest.js";

const userId = "user-1";
const projectId = "11111111-1111-4111-8111-111111111111";

describe("runQuickAddSuggest", () => {
  it("returns empty when TypeSafe client is missing", async () => {
    const result = await runQuickAddSuggest(
      { db: {} as never, client: null },
      userId,
      {
        titleForSave: "Meet with team",
        today: "2026-09-18",
        nowCount: 1,
        scheduledDate: "2026-09-19",
        parsedStartDate: null,
        parsedDeadline: null,
        parsedScheduledDate: null,
      },
    );

    expect(result.projectId).toBeNull();
    expect(result.bucket).toBeNull();
    expect(result.startDate).toBeNull();
    expect(result.deadline).toBeNull();
  });

  it("maps confident project and bucket answers", async () => {
    vi.mocked(listProjectsForUser).mockResolvedValue([
      {
        id: projectId,
        name: "PS",
        userId,
        color: "ember",
        archivedAt: null,
        deletedAt: null,
        isPrivate: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const client = {
      systemOne: vi.fn().mockResolvedValue({
        answers: {
          project: { choice: projectId, confidence: 0.9, type: "choice" },
          bucket: { choice: "next", confidence: 0.8, type: "choice" },
          start: { choice: "none", confidence: 0.2, type: "choice" },
          deadline: {
            choice: "end_of_week",
            confidence: 0.85,
            type: "choice",
          },
        },
      }),
    } as unknown as TypeSafeClient;

    const result = await runQuickAddSuggest(
      { db: {} as never, client },
      userId,
      {
        titleForSave: "Status for PS project",
        today: "2026-09-18",
        nowCount: 0,
        scheduledDate: "2026-09-19",
        parsedStartDate: null,
        parsedDeadline: null,
        parsedScheduledDate: null,
      },
    );

    expect(result.projectId).toBe(projectId);
    expect(result.matchedProjectName).toBe("PS");
    expect(result.bucket).toBe("next");
    expect(result.deadline).not.toBeNull();
    expect(result.startDate).toBeNull();
  });
});
