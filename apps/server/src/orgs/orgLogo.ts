import { randomUUID } from "node:crypto";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_MIN_PX = 256;
const LOGO_MAX_PX = 4096;

export type LogoValidationResult =
  | { ok: true; mimeType: string; ext: "png" | "jpg" | "webp" }
  | { ok: false; code: "LOGO_INVALID"; message: string };

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) {
    return null;
  }
  const sig = buf.readUInt32BE(0);
  if (sig !== 0x89504e47) {
    return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    const length = buf.readUInt16BE(offset + 2);
    if (
      marker === 0xc0 ||
      marker === 0xc2 ||
      marker === 0xc1 ||
      marker === 0xc3
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) {
    return null;
  }
  if (buf.toString("ascii", 0, 4) !== "RIFF") {
    return null;
  }
  if (buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  if (buf.toString("ascii", 12, 16) === "VP8X") {
    const width =
      1 +
      (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height =
      1 +
      (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }
  return null;
}

function validateDimensions(size: { width: number; height: number } | null): string | null {
  if (!size) {
    return "Could not read image dimensions";
  }
  if (size.width !== size.height) {
    return "Logo must be square";
  }
  if (size.width < LOGO_MIN_PX || size.height < LOGO_MIN_PX) {
    return "Logo is too small";
  }
  if (size.width > LOGO_MAX_PX || size.height > LOGO_MAX_PX) {
    return "Logo is too large";
  }
  return null;
}

export function validateOrgLogo(bytes: Buffer): LogoValidationResult {
  if (bytes.length > LOGO_MAX_BYTES) {
    return { ok: false, code: "LOGO_INVALID", message: "Logo file is too large" };
  }

  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dimError = validateDimensions(pngSize(bytes));
    if (dimError) {
      return { ok: false, code: "LOGO_INVALID", message: dimError };
    }
    return { ok: true, mimeType: "image/png", ext: "png" };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimError = validateDimensions(jpegSize(bytes));
    if (dimError) {
      return { ok: false, code: "LOGO_INVALID", message: dimError };
    }
    return { ok: true, mimeType: "image/jpeg", ext: "jpg" };
  }

  if (bytes.toString("ascii", 0, 4) === "RIFF") {
    const dimError = validateDimensions(webpSize(bytes));
    if (dimError) {
      return { ok: false, code: "LOGO_INVALID", message: dimError };
    }
    return { ok: true, mimeType: "image/webp", ext: "webp" };
  }

  return { ok: false, code: "LOGO_INVALID", message: "Unsupported image type" };
}

export function buildOrgLogoKey(orgId: string, ext: string): string {
  return `orgs/${orgId}/logo-${randomUUID()}.${ext}`;
}
