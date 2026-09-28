export type InviteTemplateInput = {
  inviterName: string;
  orgName: string;
  inviteUrl: string;
  expiresOn: string;
};

export function renderInviteEmail(input: InviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${input.inviterName} invited you to ${input.orgName} on Tudu`;
  const text = [
    `${input.inviterName} invited you to join ${input.orgName} on Tudu.`,
    `Open this link to accept: ${input.inviteUrl}`,
    `This invite expires on ${input.expiresOn}.`,
  ].join("\n\n");
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
<p><strong>${escapeHtml(input.inviterName)}</strong> invited you to join <strong>${escapeHtml(input.orgName)}</strong> on Tudu.</p>
<p><a href="${escapeAttr(input.inviteUrl)}">Accept invite</a></p>
<p style="color:#666;font-size:14px">This invite expires on ${escapeHtml(input.expiresOn)}.</p>
</body></html>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
