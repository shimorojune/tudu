import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilesystemAttachmentStorage } from "./filesystem.js";
import { createMinioAttachmentStorage } from "./minio.js";
import type { AttachmentStorage } from "./types.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveAttachmentMaxBytes(): number {
  const raw = process.env.ATTACHMENT_MAX_BYTES?.trim();
  if (!raw) {
    return 5 * 1024 * 1024;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5 * 1024 * 1024;
  }
  return parsed;
}

function defaultFilesystemRoot(): string {
  const configured = process.env.ATTACHMENT_FS_ROOT?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(serverDir, "../../.data/attachments");
}

export function resolveAttachmentStorage(): AttachmentStorage {
  const driver = process.env.ATTACHMENT_STORAGE?.trim().toLowerCase();
  const endpoint = process.env.S3_ENDPOINT?.trim();

  const useMinio =
    driver === "minio" || (driver !== "filesystem" && Boolean(endpoint));

  if (useMinio) {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    const region = process.env.S3_REGION?.trim() || "us-east-1";

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "MinIO attachment storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY",
      );
    }

    return createMinioAttachmentStorage({
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
    });
  }

  return createFilesystemAttachmentStorage(defaultFilesystemRoot());
}

export function buildAttachmentStorageKey(
  taskId: string,
  attachmentId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200);
  return `attachments/${taskId}/${attachmentId}/${safeName || "file"}`;
}
