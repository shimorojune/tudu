import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedJiraToken } from "@tudu/db";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const EXAMPLE_KEY = "change-me-32-byte-jira-key-00000";

function keyBuffer(rawKey: string): Buffer {
  if (rawKey === EXAMPLE_KEY) {
    throw new Error("JIRA_TOKEN_ENCRYPTION_KEY must not use the example value");
  }
  const key = Buffer.from(rawKey, "utf8");
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("JIRA_TOKEN_ENCRYPTION_KEY must be 32 bytes");
  }
  return key;
}

export function encryptJiraToken(
  token: string,
  rawKey = process.env.JIRA_TOKEN_ENCRYPTION_KEY ?? "",
): EncryptedJiraToken {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyBuffer(rawKey), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    encryptedToken: encrypted.toString("base64"),
    tokenIv: iv.toString("base64"),
    tokenAuthTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptJiraToken(
  encrypted: EncryptedJiraToken,
  rawKey = process.env.JIRA_TOKEN_ENCRYPTION_KEY ?? "",
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    keyBuffer(rawKey),
    Buffer.from(encrypted.tokenIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.tokenAuthTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.encryptedToken, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
