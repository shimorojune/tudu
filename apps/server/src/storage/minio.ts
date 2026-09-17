import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AttachmentGetResult, AttachmentPutInput, AttachmentStorage } from "./types.js";

export type MinioStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createMinioAttachmentStorage(
  config: MinioStorageConfig,
): AttachmentStorage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  let bucketReady: Promise<void> | null = null;

  async function ensureBucket(): Promise<void> {
    if (!bucketReady) {
      bucketReady = (async () => {
        try {
          await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        } catch {
          await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
        }
      })();
    }
    await bucketReady;
  }

  return {
    async put(input: AttachmentPutInput): Promise<void> {
      await ensureBucket();
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.mimeType,
        }),
      );
    },

    async get(key: string): Promise<AttachmentGetResult> {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );

      const body = result.Body;
      if (!body) {
        throw new Error("Empty object body");
      }

      const stream =
        body instanceof Readable
          ? body
          : Readable.fromWeb(body.transformToWebStream());

      return {
        stream,
        mimeType: result.ContentType ?? "application/octet-stream",
        sizeBytes: result.ContentLength ?? 0,
      };
    },

    async delete(key: string): Promise<void> {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: key,
        }),
      );
    },
  };
}
