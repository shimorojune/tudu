import { describe, expect, it } from "vitest";
import {
  detectLastAppliedTag,
  migrationFileHash,
} from "../scripts/backfill-migration-journal.mjs";

describe("migrationFileHash", () => {
  it("matches drizzle sha256 of the baseline migration file", () => {
    const hash = migrationFileHash("0000_public_mulholland_black");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(migrationFileHash("0000_public_mulholland_black"));
  });
});

describe("detectLastAppliedTag", () => {
  it("prefers task_number when present", async () => {
    const sql = async (strings: TemplateStringsArray) => {
      const query = strings.join("");
      if (query.includes("task_number")) {
        return [{ "?column?": 1 }];
      }
      return [];
    };

    await expect(detectLastAppliedTag(sql)).resolves.toBe("0022_task_ids");
  });

  it("detects orgs with moved_to_space enum", async () => {
    const sql = async (strings: TemplateStringsArray) => {
      const query = strings.join("");
      if (query.includes("task_number")) {
        return [];
      }
      if (query.includes("table_name = 'orgs'")) {
        return [{ "?column?": 1 }];
      }
      if (query.includes("moved_to_space")) {
        return [{ "?column?": 1 }];
      }
      return [];
    };

    await expect(detectLastAppliedTag(sql)).resolves.toBe(
      "0021_moved_to_space_timeline",
    );
  });
});
