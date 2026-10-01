import { randomUUID } from "node:crypto";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SentEmail = SendEmailInput & {
  id: string;
  sentAt: string;
};

export type EmailTransport = {
  send(input: SendEmailInput): Promise<void>;
  list?(to?: string): SentEmail[];
  clear?(): void;
};

const memoryOutbox: SentEmail[] = [];

export function createMemoryTransport(): EmailTransport {
  return {
    async send(input) {
      memoryOutbox.push({
        ...input,
        id: randomUUID(),
        sentAt: new Date().toISOString(),
      });
    },
    list(to) {
      if (!to) {
        return [...memoryOutbox];
      }
      return memoryOutbox.filter(
        (message) => message.to.toLowerCase() === to.toLowerCase(),
      );
    },
    clear() {
      memoryOutbox.length = 0;
    },
  };
}

export function createDisabledTransport(): EmailTransport {
  return {
    async send() {
      /* no-op */
    },
  };
}

export async function createResendTransport(): Promise<EmailTransport> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and EMAIL_FROM are required for resend transport");
  }
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);
  return {
    async send(input) {
      const result = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
  };
}

let transport: EmailTransport | null = null;

export async function getEmailTransport(): Promise<EmailTransport> {
  if (transport) {
    return transport;
  }
  const mode = process.env.EMAIL_TRANSPORT ?? "disabled";
  if (mode === "memory") {
    transport = createMemoryTransport();
  } else if (mode === "resend") {
    transport = await createResendTransport();
  } else {
    transport = createDisabledTransport();
  }
  return transport;
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<{ delivered: boolean }> {
  const mode = process.env.EMAIL_TRANSPORT ?? "disabled";
  const active = await getEmailTransport();
  await active.send(input);
  return { delivered: mode !== "disabled" };
}

export function readMemoryOutbox(to?: string): SentEmail[] {
  const active = transport;
  if (!active?.list) {
    return [];
  }
  return active.list(to);
}

export function clearMemoryOutbox(): void {
  transport?.clear?.();
}

export function resetEmailTransportForTests(): void {
  transport = null;
}
