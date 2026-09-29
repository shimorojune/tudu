import { toast } from "sonner";

export async function copyTaskKeyToClipboard(taskKey: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(taskKey);
    toast.success("Copied task ID");
  } catch {
    toast.error("Could not copy task ID");
  }
}
