import { showToast } from '@tudu/ui';
import { API_URL } from './config';
import { desktop, type DesktopBridge } from './desktop';

/** Where a link goes in the app: a page of Tudu itself, a file of the API (saved), or anywhere else (the browser). */
export type LinkKind = 'inside' | 'file' | 'outside';

export function linkKind(href: string, page: string, api: string = API_URL): LinkKind | null {
  let u: URL;
  try {
    u = new URL(href, page);
  } catch {
    return null;
  }
  if (!/^(https?|mailto):$/.test(u.protocol)) return null;
  const files = new URL('/api/files/', api);
  if (u.origin === files.origin && u.pathname.startsWith(files.pathname)) return 'file';
  if (u.origin === new URL(page).origin) return 'inside';
  return 'outside';
}

export const SAVED_WORDS = 'Saved to Downloads.';

/** An attachment, fetched with your session and saved to Downloads. */
export async function saveFile(bridge: DesktopBridge, href: string, name: string): Promise<void> {
  try {
    const res = await fetch(href, { credentials: 'include' });
    if (!res.ok) throw new Error(String(res.status));
    const bytes = new Uint8Array(await res.arrayBuffer());
    await bridge.saveDownload(name, bytes);
    showToast(SAVED_WORDS);
  } catch {
    showToast('Couldn’t save the file. Try again.');
  }
}

/** An attachment chip's file name: its data-name, else its words without the size beside them. */
export function chipName(a: HTMLAnchorElement): string {
  const named = a.getAttribute('data-name');
  if (named) return named;
  const copy = a.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.tp-att-s').forEach((n) => n.remove());
  return copy.textContent?.trim() || 'Attachment';
}

/** Outside the app this is a new tab; in the app, the default browser. */
export function openOutside(url: string): void {
  const d = desktop();
  if (d) void d.openExternal(url).catch(() => {});
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * In the app, every link click on the page: Tudu's own pages stay in the window, attachments save to Downloads
 * (your browser has no session for the file's address), anything else opens in the default browser.
 */
export function interceptLinks(bridge: DesktopBridge): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    // A link inside an editor being written in is text, not a link.
    if (a.closest('[contenteditable="true"]') && !a.classList.contains('tp-att')) return;
    const kind = linkKind(a.href, window.location.href);
    if (!kind) return;
    if (kind === 'inside') {
      if (a.target === '_blank') {
        e.preventDefault();
        window.location.assign(a.href);
      }
      return;
    }
    e.preventDefault();
    if (kind === 'file') {
      void saveFile(bridge, a.href, chipName(a));
    } else void bridge.openExternal(a.href).catch(() => {});
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
