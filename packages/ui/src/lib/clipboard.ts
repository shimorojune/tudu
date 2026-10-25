/** Puts `text` on the clipboard. True once it is there; false when there is no clipboard or it said no. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const COPY_FAILED_WORDS = 'Couldn’t copy the link. Try again.';
export const COPY_ID_FAILED_WORDS = 'Couldn’t copy the ID. Try again.';
