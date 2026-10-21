export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Keeps every mail in memory. Tests read it through /__test/outbox. */
export class OutboxMailer implements Mailer {
  readonly sent: Array<Mail & { at: string }> = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push({ ...mail, at: new Date().toISOString() });
  }
  /** The mails sent to one address, newest last. */
  to(address: string): Array<Mail & { at: string }> {
    const a = address.toLowerCase();
    return this.sent.filter((m) => m.to.toLowerCase() === a);
  }
  clear(): void {
    this.sent.length = 0;
  }
}

/** The sign-in code email. Plain words, the code on its own line. */
export function signInCodeMail(to: string, code: string): Mail {
  return {
    to,
    subject: `${code} is your Tudu sign-in code`,
    text: `Your Tudu sign-in code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
    html: `<p style="font:15px/1.5 -apple-system,Segoe UI,sans-serif;color:#18181b">Your Tudu sign-in code is</p><p style="font:600 32px/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;color:#18181b;margin:8px 0 16px">${code}</p><p style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#71717a">It works for 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
  };
}

/** The invite email: who asked, which space, and the join link on its own line. */
export function inviteMail(x: { to: string; spaceName: string; fromName: string; link: string }): Mail {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return {
    to: x.to,
    subject: `${x.fromName} invited you to ${x.spaceName} on Tudu`,
    text: `${x.fromName} invited you to ${x.spaceName}, a shared space in Tudu.\n\nJoin here: ${x.link}\n\nThe link works for 7 days. If you weren't expecting it, you can ignore this email.`,
    html: `<p style="font:15px/1.5 -apple-system,Segoe UI,sans-serif;color:#18181b"><b>${esc(x.fromName)}</b> invited you to <b>${esc(x.spaceName)}</b>, a shared space in Tudu.</p><p style="margin:16px 0"><a href="${x.link}" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#18181b;color:#fff;font:600 14px -apple-system,Segoe UI,sans-serif;text-decoration:none">Join ${esc(x.spaceName)}</a></p><p style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#71717a">The link works for 7 days. If you weren't expecting it, you can ignore this email.</p>`,
  };
}
