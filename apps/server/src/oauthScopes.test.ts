import { describe, expect, it } from "vitest";
import {
  oauthScopesAllowRead,
  oauthScopesAllowWrite,
  parseOAuthScopeHeader,
} from "./oauthScopes.js";

describe("oauthScopes", () => {
  it("parses scope header", () => {
    expect(parseOAuthScopeHeader("tasks:read tasks:write")).toEqual([
      "tasks:read",
      "tasks:write",
    ]);
  });

  it("allows read with tasks:read", () => {
    expect(oauthScopesAllowRead(["tasks:read"])).toBe(true);
    expect(oauthScopesAllowRead(["openid"])).toBe(false);
  });

  it("allows write only with tasks:write", () => {
    expect(oauthScopesAllowWrite(["tasks:write"])).toBe(true);
    expect(oauthScopesAllowWrite(["tasks:read"])).toBe(false);
  });
});
