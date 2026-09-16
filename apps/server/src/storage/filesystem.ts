import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AttachmentGetResult, AttachmentPutInput, AttachmentStorage } from "./types.js";

export function createFilesystemAttachmentStorage(rootDir: string): AttachmentStorage {
  async function resolvePath(key: string): Promise<string> {
    const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const full = path.join(rootDir, normalized);
    if (!full.startsWith(path.resolve(rootDir))) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  return {
    async put(input: AttachmentPutInput): Promise<void> {
      const filePath = await resolvePath(input.key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, input.body);
    },

    async get(key: string): Promise<AttachmentGetResult> {
      const filePath = await resolvePath(key);
      const info = await stat(filePath);
      const stream = createReadStream(filePath);
      return {
        stream,
        mimeType: "application/octet-stream",
        sizeBytes: info.size,
      };
    },

    async delete(key: string): Promise<void> {
      const filePath = await resolvePath(key);
      await rm(filePath, { force: true });
    },
  };
}
