import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

/** Object storage for attachments: the real bucket, or memory for tests and local work without Docker. */
export interface Storage {
  put(key: string, body: Uint8Array, type: string): Promise<void>;
  /** Null when there is no such object. */
  get(key: string): Promise<{ body: Readable; type: string; size: number } | null>;
  delete(key: string): Promise<void>;
  /** Make sure the bucket is there (S3). */
  ready(): Promise<void>;
}

export class MemoryStorage implements Storage {
  readonly objects = new Map<string, { body: Uint8Array; type: string }>();
  async put(key: string, body: Uint8Array, type: string) {
    this.objects.set(key, { body, type });
  }
  async get(key: string) {
    const o = this.objects.get(key);
    return o ? { body: Readable.from(Buffer.from(o.body)), type: o.type, size: o.body.byteLength } : null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async ready() {}
}

export interface S3Options {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export class S3Storage implements Storage {
  private readonly client: S3Client;
  constructor(private readonly o: S3Options) {
    this.client = new S3Client({
      endpoint: o.endpoint,
      region: o.region ?? 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey },
    });
  }
  async ready() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.o.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.o.bucket }));
    }
  }
  async put(key: string, body: Uint8Array, type: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.o.bucket, Key: key, Body: body, ContentType: type }),
    );
  }
  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.o.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        body: res.Body as Readable,
        type: res.ContentType ?? 'application/octet-stream',
        size: res.ContentLength ?? 0,
      };
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.o.bucket, Key: key }));
  }
}
