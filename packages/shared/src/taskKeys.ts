import { z } from "zod";

export const KEY_PREFIX_MIN = 2;
export const KEY_PREFIX_MAX = 5;
export const DEFAULT_PERSONAL_KEY_PREFIX = "ME";

export const keyPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{2,5}$/,
    `Use ${KEY_PREFIX_MIN} to ${KEY_PREFIX_MAX} uppercase letters`,
  );

export type KeyPrefix = z.infer<typeof keyPrefixSchema>;

const TASK_KEY_PATTERN = /^([A-Z]{2,5})-(\d+)$/;

export function formatTaskKey(prefix: string, taskNumber: number): string {
  return `${prefix}-${taskNumber}`;
}

export type ParsedTaskKey = {
  prefix: string;
  taskNumber: number;
};

export function parseTaskKey(raw: string): ParsedTaskKey | null {
  const trimmed = raw.trim().toUpperCase();
  const match = TASK_KEY_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  const taskNumber = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(taskNumber) || taskNumber < 1) {
    return null;
  }
  return { prefix: match[1]!, taskNumber };
}

/** Derives a 2-5 letter prefix from a space name (e.g. EGSoft -> EGSF). */
export function deriveKeyPrefixFromName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!cleaned) {
    return DEFAULT_PERSONAL_KEY_PREFIX;
  }

  const chars: string[] = [];
  for (const ch of cleaned) {
    if (chars.length === 0) {
      chars.push(ch);
      continue;
    }
    if (!"AEIOU".includes(ch) && !chars.includes(ch)) {
      chars.push(ch);
    }
    const targetLength = Math.min(4, KEY_PREFIX_MAX);
    if (chars.length >= targetLength) {
      break;
    }
  }

  const targetLength = Math.min(4, KEY_PREFIX_MAX);
  if (chars.length < targetLength) {
    for (const ch of cleaned) {
      if (chars.length >= targetLength) {
        break;
      }
      if (!chars.includes(ch)) {
        chars.push(ch);
      }
    }
  }

  const prefix = chars.join("").slice(0, KEY_PREFIX_MAX);
  if (prefix.length >= KEY_PREFIX_MIN) {
    return prefix;
  }
  return (cleaned.slice(0, KEY_PREFIX_MAX) || DEFAULT_PERSONAL_KEY_PREFIX).padEnd(
    KEY_PREFIX_MIN,
    cleaned[0] ?? "X",
  );
}

export const updateKeyPrefixBodySchema = z.object({
  keyPrefix: keyPrefixSchema,
});

export type UpdateKeyPrefixBody = z.infer<typeof updateKeyPrefixBodySchema>;
