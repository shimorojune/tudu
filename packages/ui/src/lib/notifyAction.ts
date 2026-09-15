import { toast } from "sonner";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught && typeof caught === "object" && "data" in caught) {
    const data = (caught as { data?: { error?: string } }).data;
    return data?.error ?? fallback;
  }
  if (caught instanceof Error && caught.message) {
    return caught.message;
  }
  return fallback;
}

export function mutationResult(result: unknown): Promise<unknown> {
  if (result && typeof result === "object" && "unwrap" in result) {
    const unwrap = (result as { unwrap?: () => Promise<unknown> }).unwrap;
    if (typeof unwrap === "function") {
      return unwrap();
    }
  }
  return Promise.resolve(result);
}

export async function notifyAction<T>(
  work: () => Promise<T>,
  copy: { success: string; error: string },
): Promise<T> {
  try {
    const result = await work();
    toast.success(copy.success);
    return result;
  } catch (caught) {
    toast.error(errorMessage(caught, copy.error));
    throw caught;
  }
}
