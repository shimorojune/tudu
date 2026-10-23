import { Resend } from 'resend';
import type { Mail, Mailer } from './index';

/** Sends through Resend from the verified mail domain. */
export class ResendMailer implements Mailer {
  private readonly client: Resend;
  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }
  async send(mail: Mail): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
      attachments: mail.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
        contentType: a.type,
      })),
    });
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
  }
}
