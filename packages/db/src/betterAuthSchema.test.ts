import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { account } from "./auth-schema.js";
import { jwks } from "./oauth-schema.js";

describe("betterAuthSchema", () => {
  it("account omits legacy issuer column expected by Better Auth 1.7", () => {
    const columns = Object.keys(getTableColumns(account));
    expect(columns).not.toContain("issuer");
    expect(columns).toContain("providerId");
    expect(columns).toContain("accountId");
  });

  it("jwks includes alg and crv for the Better Auth JWT plugin", () => {
    const columns = Object.keys(getTableColumns(jwks));
    expect(columns).toContain("alg");
    expect(columns).toContain("crv");
  });
});
