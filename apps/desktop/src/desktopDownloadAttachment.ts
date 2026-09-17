import { fetchAttachmentBlob } from "@tudu/ui/attachments";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export async function desktopDownloadAttachment(
  src: string,
  fileName: string,
): Promise<void> {
  const blob = await fetchAttachmentBlob(src);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = await save({
    defaultPath: fileName,
  });
  if (!path) {
    return;
  }
  await writeFile(path, bytes);
}
