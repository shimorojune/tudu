import { describe, expect, it } from "vitest";
import { renderInviteEmail } from "./templates/invite.js";

describe("invite email template", () => {
  it("renders without em dash characters", () => {
    const rendered = renderInviteEmail({
      inviterName: "Marcus Bell",
      orgName: "EGSoft",
      inviteUrl: "http://localhost:5173/invite/abc",
      expiresOn: "April 1, 2026",
    });
    expect(rendered.text).not.toMatch(/\u2014/);
    expect(rendered.html).not.toMatch(/\u2014/);
    expect(rendered.subject).toContain("EGSoft");
  });
});
