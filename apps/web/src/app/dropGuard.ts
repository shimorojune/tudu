/**
 * A file dropped where nothing takes it does nothing. Without this the webview opens the file in place of Tudu: a
 * browser leaves the app, and the Mac app would hand the file:// address to another app. Drops that a note, a comment,
 * Quick Add or Send feedback handle are left alone (they prevent the default themselves, before this runs).
 */
const carriesFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

export function guardDrop(e: DragEvent): void {
  if (e.defaultPrevented || !carriesFiles(e)) return;
  e.preventDefault();
  if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}

let installed = false;

/** Once, at startup: listens on the window, so every handler on the page has had its turn first. */
export function installDropGuard(target: Window = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener('dragover', guardDrop);
  target.addEventListener('drop', guardDrop);
}
