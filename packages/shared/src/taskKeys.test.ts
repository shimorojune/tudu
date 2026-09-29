import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_KEY_PREFIX,
  deriveKeyPrefixFromName,
  formatTaskKey,
  keyPrefixSchema,
  parseTaskKey,
} from "./taskKeys.js";

describe("taskKeys", () => {
  it("formats and parses task keys", () => {
    expect(formatTaskKey("EGSF", 214)).toBe("EGSF-214");
    expect(parseTaskKey("egsf-214")).toEqual({
      prefix: "EGSF",
      taskNumber: 214,
    });
    expect(parseTaskKey("bad")).toBeNull();
  });

  it("derives prefixes from organization names", () => {
    expect(deriveKeyPrefixFromName("EGSoft")).toBe("EGSF");
    expect(deriveKeyPrefixFromName("A")).toHaveLength(2);
  });

  it("validates key prefix length and case", () => {
    expect(keyPrefixSchema.parse("me")).toBe("ME");
    expect(() => keyPrefixSchema.parse("A")).toThrow();
    expect(() => keyPrefixSchema.parse("TOOLONG")).toThrow();
    expect(DEFAULT_PERSONAL_KEY_PREFIX).toBe("ME");
  });
});
