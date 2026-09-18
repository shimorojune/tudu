import { TypeSafeClient } from "@typesafe-ai/sdk";

let cached: TypeSafeClient | null = null;

export function getTypeSafeClient(): TypeSafeClient | null {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!cached) {
    cached = new TypeSafeClient({ apiKey });
  }

  return cached;
}

/** Test hook to replace the singleton client. */
export function resetTypeSafeClientForTests() {
  cached = null;
}
