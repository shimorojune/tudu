import { fileSize } from '@tudu/core';
import { mergeAttributes, Node } from '@tiptap/core';

export interface AttachmentAttrs {
  id: string;
  name: string;
  size: number;
}

/**
 * An attachment chip inside notes or a comment: an inline atom that links to the API's file route. Stored as
 * `<a class="tp-att" href="/api/files/ID" data-id data-name data-size>`, which the cleaner keeps.
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
    return [{ tag: 'a.tp-att' }];
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
        contenteditable: 'false',
      }),
      ['span', { class: 'tp-att-i' }],
      a.name,
      ['span', { class: 'tp-att-s' }, fileSize(a.size)],
    ];
  },
});

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
