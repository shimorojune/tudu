import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesystemAttachmentStorage } from "./filesystem.js";

describe("filesystem attachment storage", () => {
  let root: string;
  let storage: ReturnType<typeof createFilesystemAttachmentStorage>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "tudu-attach-"));
    storage = createFilesystemAttachmentStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips bytes", async () => {
    const key = "attachments/task/id/file.txt";
    const body = Buffer.from("hello");
    await storage.put({ key, body, mimeType: "text/plain" });
    const result = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello");
    const filePath = path.join(root, key);
    expect(await readFile(filePath, "utf8")).toBe("hello");
  });
});
