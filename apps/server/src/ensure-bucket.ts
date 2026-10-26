import { S3Storage } from './storage';

/**
 * CI: create the attachments bucket on the job's RustFS service, retrying while it starts (up to a minute). Reads
 * the TUDU_CI_S3_* variables the end-to-end job sets; an existing bucket is fine.
 */
const env = process.env;
const storage = new S3Storage({
  endpoint: env.TUDU_CI_S3_ENDPOINT ?? 'http://127.0.0.1:9000',
  bucket: env.TUDU_CI_S3_BUCKET ?? 'tudu-ci',
  accessKeyId: env.TUDU_CI_S3_ACCESS_KEY_ID ?? '',
  secretAccessKey: env.TUDU_CI_S3_SECRET_ACCESS_KEY ?? '',
});
let last: unknown;
for (let i = 0; i < 30; i++) {
  try {
    await storage.ready();
    console.log(`storage: bucket ${env.TUDU_CI_S3_BUCKET ?? 'tudu-ci'} is ready`);
    process.exit(0);
  } catch (err) {
    last = err;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
console.error('storage: the bucket was not created', last);
process.exit(1);
