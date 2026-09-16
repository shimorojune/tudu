import { randomUUID } from "node:crypto";
import type { Db } from "@tudu/db";
import {
  createTaskAttachment,
  findTaskAttachmentById,
  findTaskById,
  resolveTaskAccess,
} from "@tudu/db";
import {
  attachmentContentPath,
  type UploadTaskAttachmentResponse,
} from "@tudu/shared";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { SessionEnv } from "../session-middleware.js";
import {
  buildAttachmentStorageKey,
  resolveAttachmentMaxBytes,
  resolveAttachmentStorage,
} from "../storage/resolve.js";

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "file";
  return base.slice(0, 255);
}

function resolveMimeType(file: File): string {
  const type = file.type?.trim();
  if (type) {
    return type;
  }
  return "application/octet-stream";
}

export function createTaskAttachmentsRoute(db: Db) {
  const app = new Hono<SessionEnv>();
  const storage = resolveAttachmentStorage();
  const maxBytes = resolveAttachmentMaxBytes();

  app.use("*", async (c, next) => {
    const session = c.get("session");
    if (!session?.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  app.post("/tasks/:taskId/attachments", async (c) => {
    const session = c.get("session")!;
    const taskId = c.req.param("taskId");
    const ownerTask = await findTaskById(db, session.user.id, taskId);
    if (!ownerTask) {
      return c.json({ error: "Task not found" }, 404);
    }

    const body = await c.req.parseBody();
    const rawFile = body.file;
    if (!(rawFile instanceof File)) {
      return c.json({ error: "Expected a file field named file" }, 400);
    }

    if (rawFile.size <= 0) {
      return c.json({ error: "File is empty" }, 400);
    }

    if (rawFile.size > maxBytes) {
      return c.json(
        {
          error: `File exceeds maximum size of ${Math.floor(maxBytes / (1024 * 1024))}MB`,
        },
        413,
      );
    }

    const attachmentId = randomUUID();
    const fileName = sanitizeFileName(rawFile.name);
    const mimeType = resolveMimeType(rawFile);
    const storageKey = buildAttachmentStorageKey(taskId, attachmentId, fileName);
    const buffer = Buffer.from(await rawFile.arrayBuffer());

    await storage.put({
      key: storageKey,
      body: buffer,
      mimeType,
    });

    const row = await createTaskAttachment(db, {
      id: attachmentId,
      taskId,
      userId: session.user.id,
      fileName,
      mimeType,
      sizeBytes: rawFile.size,
      storageKey,
    });

    const response: UploadTaskAttachmentResponse = {
      attachment: {
        id: row.id,
        taskId: row.taskId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        contentUrl: attachmentContentPath(row.id),
      },
    };

    return c.json(response, 201);
  });

  app.get("/attachments/:attachmentId/content", async (c) => {
    const session = c.get("session")!;
    const attachmentId = c.req.param("attachmentId");
    const row = await findTaskAttachmentById(db, attachmentId);
    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }

    const access = await resolveTaskAccess(db, session.user.id, row.taskId);
    if (!access) {
      return c.json({ error: "Not found" }, 404);
    }

    const object = await storage.get(row.storageKey);

    c.header("Content-Type", row.mimeType || object.mimeType);
    c.header("Content-Length", String(row.sizeBytes));
    c.header(
      "Content-Disposition",
      `inline; filename="${row.fileName.replace(/"/g, "")}"`,
    );

    return stream(c, async (streamWriter) => {
      for await (const chunk of object.stream) {
        await streamWriter.write(chunk);
      }
    });
  });

  return app;
}
