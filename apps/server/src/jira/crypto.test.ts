import { describe, expect, it } from "vitest";
import { decryptJiraToken, encryptJiraToken } from "./crypto.js";

const key = "12345678901234567890123456789012";

describe("Jira token crypto", () => {
  it("round-trips a PAT without returning the token as ciphertext", () => {
    const encrypted = encryptJiraToken("pat-secret", key);

    expect(encrypted.encryptedToken).not.toBe("pat-secret");
    expect(encrypted.tokenIv).not.toHaveLength(0);
    expect(encrypted.tokenAuthTag).not.toHaveLength(0);
    expect(decryptJiraToken(encrypted, key)).toBe("pat-secret");
  });

  it("requires a 32 byte key", () => {
    expect(() => encryptJiraToken("pat-secret", "short")).toThrow(
      "JIRA_TOKEN_ENCRYPTION_KEY",
    );
  });

  it("rejects the documented example key", () => {
    expect(() =>
      encryptJiraToken("pat-secret", "change-me-32-byte-jira-key-00000"),
    ).toThrow("JIRA_TOKEN_ENCRYPTION_KEY must not use the example value");
  });
});
