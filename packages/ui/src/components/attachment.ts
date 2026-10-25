import { fileSize, splitFileName } from '@tudu/core';
import { mergeAttributes, Node } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';

export interface AttachmentAttrs {
  id: string;
  name: string;
  size: number;
}

/** The chip's name in two parts, so a long name is cut before its extension and the extension always shows. */
function nameSpec(name: string): DOMOutputSpec {
  const { stem, ext } = splitFileName(name);
  return ext
    ? [
        'span',
        { class: 'tp-att-n' },
        ['span', { class: 'tp-att-stem' }, stem],
        ['span', { class: 'tp-att-ext' }, ext],
      ]
    : ['span', { class: 'tp-att-n' }, ['span', { class: 'tp-att-stem' }, stem]];
}

/**
 * An attachment chip inside notes or a comment: an inline atom that links to the API's file route. Stored as
 * `chipHtml` in `@tudu/core` writes it (`<a class="tp-att" href="/api/files/ID" data-id data-name data-size title>`),
 * which the cleaner keeps. Chips stored before the name was split read `data-name` and come back in the new markup.
 */
export const Attachment = Node.create<{ base: string }>({
  name: 'attachment',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addOptions() {
    return { base: '' };
  },
  addAttributes() {
    return {
      id: { default: '', parseHTML: (el) => el.getAttribute('data-id') ?? '' },
      name: { default: 'file', parseHTML: (el) => el.getAttribute('data-name') ?? el.textContent ?? 'file' },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size') ?? 0) },
    };
  },
  parseHTML() {
    // Ahead of the link mark's `a[href]`, which would otherwise take the chip as a plain link (marks are tried first
    // at equal priority) and lose its name and size.
    return [{ tag: 'a.tp-att', priority: 60 }];
  },
  renderHTML({ node }) {
    const a = node.attrs as AttachmentAttrs;
    return [
      'a',
      mergeAttributes({
        class: 'tp-att',
        href: `${this.options.base}/api/files/${a.id}`,
        target: '_blank',
        'data-type': 'attachment',
        'data-id': a.id,
        'data-name': a.name,
        'data-size': String(a.size),
        title: a.name,
        contenteditable: 'false',
      }),
      ['span', { class: 'tp-att-i' }],
      nameSpec(a.name),
      ['span', { class: 'tp-att-s' }, fileSize(a.size)],
    ];
  },
});

export interface UploadAttrs {
  key: string;
  name: string;
  size: number;
  /** 0 to 1. */
  progress: number;
  error: boolean;
}

/**
 * A file on its way up: the chip with the upload's fill behind it and the percent where the size goes; on failure it
 * turns red with Retry and ×. It lives only in the editor. Its stored form is an empty `<span data-tp-upload>`, which
 * `withoutUploads` (and the cleaner) take out, so a half-sent file never reaches the notes.
 */
export const AttachmentUpload = Node.create({
  name: 'attachmentUpload',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      key: { default: '' },
      name: { default: 'file' },
      size: { default: 0 },
      progress: { default: 0 },
      error: { default: false },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return ['span', { 'data-tp-upload': (node.attrs as UploadAttrs).key }];
  },
  addNodeView() {
    // Retry and × tell the editor around them with an event, which knows the file behind the key.
    const say = (dom: HTMLElement, type: 'tp-att-retry' | 'tp-att-remove', key: string) =>
      dom.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: key }));
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.contentEditable = 'false';
      let shown = '';
      const draw = (a: UploadAttrs) => {
        const sig = `${a.name}|${a.error}|${Math.round(a.progress * 100)}`;
        if (sig === shown) return;
        const first = !shown;
        shown = sig;
        dom.className = `tp-att ${a.error ? 'tp-att-err' : 'tp-att-up'}${first ? ' tp-att-in' : ''}`;
        dom.setAttribute('data-name', a.name);
        dom.setAttribute('data-tp-upload', a.key);
        dom.title = a.name;
        dom.style.setProperty('--tp-up', String(a.progress));
        const pct = Math.round(a.progress * 100);
        dom.setAttribute('role', a.error ? 'group' : 'progressbar');
        dom.setAttribute('aria-label', a.error ? `${a.name} didn’t attach` : `Attaching ${a.name}`);
        if (a.error) dom.removeAttribute('aria-valuenow');
        else dom.setAttribute('aria-valuenow', String(pct));
        const { stem, ext } = splitFileName(a.name);
        dom.replaceChildren();
        const el = (tag: string, cls: string, text?: string) => {
          const e = document.createElement(tag);
          e.className = cls;
          if (text !== undefined) e.textContent = text;
          return e;
        };
        const n = el('span', 'tp-att-n');
        n.append(el('span', 'tp-att-stem', stem));
        if (ext) n.append(el('span', 'tp-att-ext', ext));
        dom.append(el('span', 'tp-att-i'), n, el('span', 'tp-att-s', a.error ? fileSize(a.size) : `${pct}%`));
        if (a.error) {
          const retry = el('button', 'tp-att-btn', 'Retry') as HTMLButtonElement;
          retry.type = 'button';
          retry.onclick = () => say(dom, 'tp-att-retry', a.key);
          const x = el('button', 'tp-att-x') as HTMLButtonElement;
          x.type = 'button';
          x.setAttribute('aria-label', `Remove ${a.name}`);
          x.innerHTML =
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
          x.onclick = () => say(dom, 'tp-att-remove', a.key);
          dom.append(retry, x);
        }
      };
      draw(node.attrs as UploadAttrs);
      return {
        dom,
        update: (next) => {
          if (next.type.name !== 'attachmentUpload' || next.attrs.key !== node.attrs.key) return false;
          draw(next.attrs as UploadAttrs);
          return true;
        },
        // Its buttons are its own: the editor neither moves the caret nor reads them as an edit.
        stopEvent: (e) => e.target instanceof Element && !!e.target.closest('button'),
        ignoreMutation: () => true,
      };
    };
  },
});

/** What is stored never holds a chip that is still uploading (or failed). */
export function withoutUploads(html: string): string {
  return html.replace(/<span data-tp-upload="[^"]*"><\/span>/g, '');
}

/** Stored chips link to the API's own path; shown on the web they need the API's origin in front. */
export function withFileBase(html: string, base: string | undefined): string {
  if (!base) return html;
  return html.replace(/href="\/api\/files\//g, `href="${base}/api/files/`);
}

/** The opposite, for what is stored: the API's origin comes off again. */
export function withoutFileBase(html: string, base: string | undefined): string {
  if (!base) return html;
  return html.split(`href="${base}/api/files/`).join('href="/api/files/');
}
