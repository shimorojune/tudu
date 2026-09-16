import type { Readable } from "node:stream";

export type AttachmentPutInput = {
  key: string;
  body: Buffer;
  mimeType: string;
};

export type AttachmentGetResult = {
  stream: Readable;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentStorage = {
  put(input: AttachmentPutInput): Promise<void>;
  get(key: string): Promise<AttachmentGetResult>;
  delete(key: string): Promise<void>;
};
