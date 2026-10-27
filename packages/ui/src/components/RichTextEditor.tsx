import {
  cleanHtml,
  FILE_MAX_BYTES,
  isBlankHtml,
  isEmptyHtml as htmlIsEmpty,
  pastedFileName,
  toHtml,
  upgradeChips,
} from '@tudu/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Attachment, AttachmentUpload, withFileBase, withoutFileBase, withoutUploads } from './attachment';
import { DrawingKeys, DrawingNode, drawingFrame, PenIcon } from './NoteDrawing';
import { showToast, TOAST_WITH_ACTION_MS } from './Toast';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import { useOutside } from '../lib/hooks';
import { Button } from './Button';
import { MenuList } from './Menu';

export interface RichTextEditorProps {
  /**
   * Notes sit in the paper with a toolbar that rises over them; a comment is a box that grows as you write; Quick Add's
   * note is a few lines with a slim formatting row under it while it has focus.
   */
  variant: 'notes' | 'comment' | 'quick';
  /** The accessible name: "Notes", "Write a comment". */
  label: string;
  /** HTML (or plain text, which becomes paragraphs). */
  value?: string;
  /** Change it to load a different value (another task, another comment). */
  resetKey?: string | number;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  readOnly?: boolean;
  /** The comment box keeps its toolbar and button open (editing a comment). */
  alwaysOpen?: boolean;
  /** Leaving the field: the HTML as it is now, and whether it says anything. */
  onBlur?: (html: string, isEmpty: boolean) => void;
  onInput?: (html: string, isEmpty: boolean) => void;
  /** Comments: the button at the end of the toolbar, or Cmd/Ctrl with Enter. Quick Add: Cmd/Ctrl with Enter adds. */
  onSubmit?: (html: string) => void;
  submitLabel?: string;
  onCancel?: () => void;
  /**
   * "Attach a file", and files pasted or dropped on the words: upload it and get back what the chip needs. Without it
   * the button stays out and files are left to whatever holds the editor (Quick Add's files row).
   */
  onAttach?: (
    file: File,
    onProgress?: (ratio: number) => void,
  ) => Promise<{ id: string; name: string; size: number }>;
  /** Where attachment chips link: the API's origin. */
  fileBase?: string;
  /** No connection: a file would never arrive, so none is taken. */
  offline?: boolean;
  /**
   * Drawings (the Notebook's editor only): Draw at the end of the strip puts a drawing block at the caret and opens
   * it. The blocks' pictures come from a DrawingContext around the editor.
   */
  drawings?: RichTextDrawings;
  className?: string;
}

export interface RichTextDrawings {
  /** A new drawing's id. */
  newId: () => string;
  /** Open a drawing full size, from its block's frame. */
  onOpen: (id: string, from: DOMRect | null) => void;
  /** The editor's own handle on its blocks: take one out (an empty drawing on Done). */
  bind?: (fns: { remove: (id: string) => void }) => void;
}

export { toHtml };

const ATTACH_FAILED = 'Couldn’t attach the file. Check your connection and retry.';
const TOO_BIG = 'That file is too big. Files can be up to 25 MB.';
const OFFLINE = 'You’re offline. Files need a connection.';

/** What the editor hands on: the API's origin off its chips, and no chip that is still on its way. */
function storedHtml(html: string, base: string | undefined): string {
  return withoutUploads(withoutFileBase(html, base));
}

/** The same file under the name it should have (a pasted screenshot's "image.png" becomes "Pasted image …"). */
function renamed(f: File, name: string): File {
  return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified });
}

const hasFiles = (dt: DataTransfer | null | undefined) => Array.from(dt?.types ?? []).includes('Files');

const I = {
  bold: <path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />,
  italic: <path d="M19 4h-9M14 20H5M15 4 9 20" />,
  underline: <path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" />,
  ul: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx={4.5} cy={6} r={1} />
      <circle cx={4.5} cy={12} r={1} />
      <circle cx={4.5} cy={18} r={1} />
    </>
  ),
  ol: <path d="M10 6h10M10 12h10M10 18h10M4 4h1v5M4 9h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />,
  check: (
    <>
      <rect x={3} y={4} width={6} height={6} rx={1.5} />
      <path d="m3.5 16.5 2 2 3.5-4M13 7h8M13 17h8" />
    </>
  ),
  link: (
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  ),
  mark: <path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />,
  attach: (
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  more: (
    <>
      <circle cx={12} cy={12} r={1} />
      <circle cx={19} cy={12} r={1} />
      <circle cx={5} cy={12} r={1} />
    </>
  ),
  chev: <path d="m6 9 6 6 6-6" />,
};

function Ic({ name, size = 15 }: { name: keyof typeof I; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {I[name]}
    </svg>
  );
}

interface BProps {
  label: string;
  on?: boolean;
  wide?: boolean;
  toggle?: boolean;
  expanded?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}

/** A toolbar button: pressing it never takes the selection away from the words. */
function RTB({ label, on, wide, toggle, expanded, className, onClick, children }: BProps) {
  return (
    <button
      type="button"
      className={cx('tp-rte-b', on && 'tp-on', wide && 'tp-wide', className)}
      aria-label={label}
      title={label}
      aria-pressed={toggle ? (on ? 'true' : 'false') : undefined}
      aria-expanded={expanded === undefined ? undefined : expanded ? 'true' : 'false'}
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const STYLES = [
  { v: 'p', label: 'Text' },
  { v: 'h2', label: 'Heading' },
  { v: 'h3', label: 'Subheading' },
  { v: 'blockquote', label: 'Quote' },
  { v: 'pre', label: 'Code block' },
] as const;

/**
 * The editor's extensions: exactly what the cleaner keeps, and the chip of a file on its way up. The Notebook's
 * editor also takes drawing blocks.
 */
export function editorExtensions(fileBase = '', drawings?: { onOpen: (id: string) => void }) {
  return [
    ...(drawings ? [DrawingNode.configure({ onOpen: drawings.onOpen }), DrawingKeys] : []),
    Attachment.configure({ base: fileBase }),
    AttachmentUpload,
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
      dropcursor: false,
      gapcursor: false,
    }),
    Highlight,
    Superscript,
    Subscript,
    TaskList.configure({ HTMLAttributes: { class: 'tp-checks' } }),
    TaskItem.configure({ nested: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ];
}

/**
 * The placeholder's rule: one paragraph with nothing in it. Tiptap's own isEmpty also counts an empty list item,
 * heading or quote, which left the placeholder drawn through a new bullet.
 */
export function blankDoc(doc: PmNode): boolean {
  if (doc.childCount !== 1) return false;
  const only = doc.firstChild!;
  return only.type.name === 'paragraph' && only.content.size === 0;
}

/**
 * Notes and comments are rich text on Tiptap. The editor reads as part of the paper: no frame until you write,
 * then a slim toolbar of the few marks people use (text style, bold, italic, underline, lists, checklist, link,
 * highlight, code), the rest under More. When the toolbar would overflow, the least used marks fold into More.
 * A file from the Attach button, a paste or a drop goes in at once as a chip that fills while it uploads.
 */
export function RichTextEditor(p: RichTextEditorProps) {
  const comment = p.variant === 'comment';
  const quick = p.variant === 'quick';
  const wrap = useRef<HTMLDivElement | null>(null);
  const barEl = useRef<HTMLDivElement | null>(null);
  const lastW = useRef(0);
  const [fit, setFit] = useState(0);
  const [focused, setFocused] = useState(false);
  // Blank (the placeholder shows) only on nothing or one empty line: an empty bullet is not blank, though it saves as empty.
  const [empty, setEmpty] = useState(() => isBlankHtml(toHtml(p.value)));
  const [menu, setMenu] = useState<null | 'style' | 'link' | 'more'>(null);
  const [link, setLink] = useState('');
  // Chips still uploading or failed: a comment waits for them.
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(0);
  const fileEl = useRef<HTMLInputElement | null>(null);
  /** The files behind chips that are uploading or failed, by key, so Retry sends the same file. Never in the words. */
  const pending = useRef(new Map<string, File>());
  const seq = useRef(0);
  const edRef = useRef<Editor | null>(null);
  const submitNow = useRef(() => {});
  const chipActs = useRef<{ retry: (key: string) => void; remove: (key: string) => void }>({
    retry: () => {},
    remove: () => {},
  });
  const cb = useRef(p);
  useLayoutEffect(() => {
    cb.current = p;
  });

  const drawingsOn = !!p.drawings;
  /** A block's picture, where it sits now. */
  const frameOf = (id: string): DOMRect | null => drawingFrame(wrap.current, id);
  const editor = useEditor(
    {
      extensions: editorExtensions(
        p.fileBase,
        drawingsOn ? { onOpen: (id) => cb.current.drawings?.onOpen(id, frameOf(id)) } : undefined,
      ),
      content: withFileBase(toHtml(p.value), p.fileBase),
      editable: !p.readOnly,
      autofocus: p.autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: 'tp-prose tp-rte-area',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': p.label,
          'data-placeholder': p.placeholder ?? '',
          spellcheck: 'true',
        },
        // Cmd/Ctrl with Enter posts the comment (adds the Quick Add task) before the editor's own keys make a line.
        handleKeyDown: (_view, e) => {
          if (cb.current.variant === 'notes' || e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return false;
          submitNow.current();
          return true;
        },
        // A file on the clipboard is attached, and nothing else of that paste goes in (text pastes are untouched).
        handlePaste: (_view, e) => {
          const files = Array.from(e.clipboardData?.files ?? []);
          if (!files.length) return false;
          if (cb.current.onAttach) {
            const now = new Date();
            attachFiles(files.map((f) => renamed(f, pastedFileName(f.name, f.type, now))));
          }
          return true;
        },
        // A dropped file goes in where it lands. Without onAttach the drop is left to the field around the editor.
        handleDrop: (view, e, _slice, moved) => {
          if (moved || !e.dataTransfer?.files.length) return false;
          setDragging(0);
          if (cb.current.onAttach) {
            const at = view.posAtCoords({ left: e.clientX, top: e.clientY });
            attachFiles(Array.from(e.dataTransfer.files), at?.pos);
          }
          return true;
        },
      },
      onUpdate: ({ editor: e }) => {
        let n = 0;
        e.state.doc.descendants((node) => {
          if (node.type.name === 'attachmentUpload') n++;
        });
        setUploading(n);
        const html = storedHtml(e.getHTML(), cb.current.fileBase);
        const em = htmlIsEmpty(html);
        setEmpty(blankDoc(e.state.doc));
        cb.current.onInput?.(html, em);
      },
      onFocus: () => setFocused(true),
      onBlur: ({ editor: e }) => {
        setFocused(false);
        const html = storedHtml(e.getHTML(), cb.current.fileBase);
        const em = htmlIsEmpty(html);
        cb.current.onBlur?.(em ? '' : html, em);
      },
    },
    [p.resetKey, drawingsOn],
  );
  useLayoutEffect(() => {
    edRef.current = editor;
  });
  useEffect(() => {
    p.drawings?.bind?.({
      remove: (id) => {
        const e = edRef.current;
        if (!e || e.isDestroyed) return;
        let at = -1;
        e.state.doc.descendants((n, pos) => {
          if (n.type.name === 'drawing' && n.attrs.id === id) at = pos;
          return at < 0;
        });
        // Not an undo step: the empty drawing was never kept.
        if (at >= 0) e.view.dispatch(e.state.tr.delete(at, at + 1).setMeta('addToHistory', false));
      },
    });
  });

  /** Draw: a drawing block at the caret, opened full size once it is in the page. */
  function draw() {
    const d = p.drawings;
    if (!editor || !d) return;
    const id = d.newId();
    editor.chain().focus().insertContent({ type: 'drawing', attrs: { id } }).run();
    requestAnimationFrame(() => d.onOpen(id, frameOf(id)));
  }
  // A reset loads other words: the blank state follows them.
  const [seenReset, setSeenReset] = useState(p.resetKey);
  if (p.resetKey !== seenReset) {
    setSeenReset(p.resetKey);
    setEmpty(isBlankHtml(toHtml(p.value)));
  }

  // What is on under the caret, for the pressed state of each button.
  const act = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            underline: e.isActive('underline'),
            ul: e.isActive('bulletList'),
            ol: e.isActive('orderedList'),
            check: e.isActive('taskList'),
            block: e.isActive('heading', { level: 2 })
              ? 'h2'
              : e.isActive('heading', { level: 3 })
                ? 'h3'
                : e.isActive('blockquote')
                  ? 'blockquote'
                  : e.isActive('codeBlock')
                    ? 'pre'
                    : 'p',
          }
        : { bold: false, italic: false, underline: false, ul: false, ol: false, check: false, block: 'p' },
  });

  useOutside(!!menu, wrap, () => setMenu(null));

  // Fit the toolbar to its width: when it would overflow, the least used marks move into More, one step at a time.
  const compact = !!p.compact;
  const lvl = quick ? 0 : Math.max(fit, compact ? 2 : 0);
  // Measured after every render, since what the bar shows changes its width; it settles within three steps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const b = barEl.current;
    if (!quick && b && fit < 3 && b.clientWidth > 0 && b.scrollWidth > b.clientWidth + 1) setFit(fit + 1);
  });
  useEffect(() => {
    if (!window.ResizeObserver || !wrap.current) return;
    const ro = new ResizeObserver((en) => {
      const w = Math.round(en[0]!.contentRect.width);
      if (Math.abs(w - lastW.current) > 1) {
        lastW.current = w;
        setFit(0);
      }
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  /** Run a command with the selection kept where it was. */
  const exec = (fn: (c: ReturnType<Editor['chain']>) => { run: () => boolean }) => {
    if (editor) fn(editor.chain().focus()).run();
  };

  function setStyle(v: (typeof STYLES)[number]['v']) {
    setMenu(null);
    if (!editor) return;
    const c = editor.chain().focus();
    if (v === 'p') c.setParagraph().run();
    else if (v === 'h2') c.toggleHeading({ level: 2 }).run();
    else if (v === 'h3') c.toggleHeading({ level: 3 }).run();
    else if (v === 'blockquote') c.toggleBlockquote().run();
    else c.toggleCodeBlock().run();
  }

  function applyLink() {
    let u = link.trim();
    setMenu(null);
    if (!u || !editor) return;
    if (!/^[a-z]+:/i.test(u)) u = `https://${u}`;
    setLink('');
    const { from, to } = editor.state.selection;
    if (from === to) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${u.replace(/"/g, '&quot;')}">${u.replace(/^https?:\/\//, '')}</a> `)
        .run();
    } else editor.chain().focus().extendMarkRange('link').setLink({ href: u }).run();
  }

  function submit() {
    if (!editor || editor.isEmpty || !p.onSubmit) return;
    if (quick) {
      p.onSubmit(cleanHtml(storedHtml(editor.getHTML(), p.fileBase)));
      return;
    }
    // A comment waits until its files have landed (or the failed ones are dealt with).
    if (uploading) return;
    p.onSubmit(cleanHtml(storedHtml(editor.getHTML(), p.fileBase)));
    // The box empties and keeps the caret, ready for the next comment.
    editor.chain().clearContent(true).focus().run();
    setEmpty(true);
  }

  useLayoutEffect(() => {
    submitNow.current = submit;
    chipActs.current = { retry: (key) => void upload(key), remove: dropUpload };
  });
  // Retry and × on a failed chip.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const retry = (e: Event) => chipActs.current.retry((e as CustomEvent<string>).detail);
    const remove = (e: Event) => chipActs.current.remove((e as CustomEvent<string>).detail);
    el.addEventListener('tp-att-retry', retry);
    el.addEventListener('tp-att-remove', remove);
    return () => {
      el.removeEventListener('tp-att-retry', retry);
      el.removeEventListener('tp-att-remove', remove);
    };
  }, []);

  /** Take a chip that is uploading or failed out of the words, and forget its file. */
  function dropUpload(key: string) {
    pending.current.delete(key);
    const e = edRef.current;
    const at = findUpload(key);
    if (e && at) e.view.dispatch(e.state.tr.delete(at.pos, at.pos + 1));
  }

  /** Where the chip for `key` is now, if it is still there. */
  function findUpload(key: string): { pos: number; node: PmNode } | null {
    const e = edRef.current;
    if (!e || e.isDestroyed) return null;
    let found: { pos: number; node: PmNode } | null = null;
    e.state.doc.descendants((node, pos) => {
      if (found) return false;
      if (node.type.name === 'attachmentUpload' && node.attrs.key === key) found = { pos, node };
      return true;
    });
    return found;
  }

  function patchUpload(key: string, attrs: Record<string, unknown>) {
    const e = edRef.current;
    const at = findUpload(key);
    if (!e || !at) return;
    e.view.dispatch(
      e.state.tr
        .setNodeMarkup(at.pos, undefined, { ...at.node.attrs, ...attrs })
        .setMeta('addToHistory', false),
    );
  }

  /** Each file goes in at once as an uploading chip (at `pos`, or the caret), then uploads. */
  function attachFiles(files: File[], pos?: number) {
    const e = edRef.current;
    if (!files.length || !e || !cb.current.onAttach) return;
    if (cb.current.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      showToast(OFFLINE);
      return;
    }
    const ok = files.filter((f) => f.size <= FILE_MAX_BYTES);
    if (ok.length < files.length) showToast(TOO_BIG);
    if (!ok.length) return;
    const keys = ok.map((f) => {
      const key = `u${Date.now().toString(36)}${seq.current++}`;
      pending.current.set(key, f);
      return key;
    });
    const content = ok.flatMap((f, i) => [
      {
        type: 'attachmentUpload',
        attrs: { key: keys[i], name: f.name, size: f.size, progress: 0, error: false },
      },
      { type: 'text', text: ' ' },
    ]);
    const c = e.chain().focus();
    (pos === undefined ? c.insertContent(content) : c.insertContentAt(pos, content)).run();
    for (const k of keys) void upload(k);
  }

  async function upload(key: string) {
    const file = pending.current.get(key);
    const send = cb.current.onAttach;
    if (!file || !send) return;
    if (cb.current.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      showToast(OFFLINE);
      return;
    }
    patchUpload(key, { error: false, progress: 0 });
    try {
      const saved = await send(file, (ratio) =>
        patchUpload(key, { progress: Math.min(1, Math.max(0, ratio)) }),
      );
      pending.current.delete(key);
      const e = edRef.current;
      const at = findUpload(key);
      if (!e || !at) return;
      e.view.dispatch(
        e.state.tr.replaceWith(
          at.pos,
          at.pos + 1,
          e.schema.nodes.attachment!.create({ id: saved.id, name: saved.name, size: saved.size }),
        ),
      );
      // Notes save when the field is left; a file that lands after that saves on its own.
      if (!e.isFocused) {
        const html = storedHtml(e.getHTML(), cb.current.fileBase);
        const em = htmlIsEmpty(html);
        cb.current.onBlur?.(em ? '' : html, em);
      }
    } catch (err) {
      const r = err as { status?: number; message?: string };
      // The server said no (too big, not allowed): retrying would not help, so the chip goes and the reason shows.
      if (typeof r?.status === 'number' && r.status >= 400 && r.status < 500 && r.message) {
        dropUpload(key);
        showToast(r.message);
        return;
      }
      patchUpload(key, { error: true });
      showToast(ATTACH_FAILED, { duration: TOAST_WITH_ACTION_MS });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Esc steps back one layer: a menu closes first, then the field lets go.
      if (menu) {
        e.stopPropagation();
        setMenu(null);
        editor?.commands.focus();
      } else (e.target as HTMLElement).blur?.();
      return;
    }
  }

  const styleLabel = (STYLES.find((x) => x.v === act.block) ?? STYLES[0]).label;
  // A comment box or a Quick Add note with words in it keeps its bar, so leaving it never moves Comment or Add from
  // under the pointer.
  const lean = comment || quick;
  const onNow = focused || !!menu || (lean && !empty) || !!p.alwaysOpen;

  const bar = (
    <div ref={barEl} className="tp-rte-bar" role="toolbar" aria-label={`${p.label} formatting`}>
      {lean ? null : (
        <div className="tp-rte-dd">
          <RTB
            label="Text style"
            wide
            expanded={menu === 'style'}
            onClick={() => setMenu(menu === 'style' ? null : 'style')}
          >
            <span>{styleLabel}</span>
            <Ic name="chev" size={13} />
          </RTB>
          {menu === 'style' ? (
            <div className="tp-rte-pop">
              <MenuList
                label="Text style"
                items={STYLES.map((x) => ({
                  label: <span className={`tp-rte-sty tp-rte-sty-${x.v}`}>{x.label}</span>,
                  onSelect: () => setStyle(x.v),
                }))}
              />
            </div>
          ) : null}
        </div>
      )}
      {lean ? null : <i className="tp-rte-sep" />}
      <RTB label="Bold" toggle on={act.bold} onClick={() => exec((c) => c.toggleBold())}>
        <Ic name="bold" />
      </RTB>
      {quick && compact ? null : (
        <RTB label="Italic" toggle on={act.italic} onClick={() => exec((c) => c.toggleItalic())}>
          <Ic name="italic" />
        </RTB>
      )}
      {lvl >= 1 || lean ? null : (
        <RTB label="Underline" toggle on={act.underline} onClick={() => exec((c) => c.toggleUnderline())}>
          <Ic name="underline" />
        </RTB>
      )}
      {quick && compact ? null : <i className="tp-rte-sep" />}
      <RTB label="Bulleted list" toggle on={act.ul} onClick={() => exec((c) => c.toggleBulletList())}>
        <Ic name="ul" />
      </RTB>
      {lvl >= 2 ? null : (
        <RTB label="Numbered list" toggle on={act.ol} onClick={() => exec((c) => c.toggleOrderedList())}>
          <Ic name="ol" />
        </RTB>
      )}
      {comment || lvl >= 3 ? null : (
        <RTB label="Checklist" toggle on={act.check} onClick={() => exec((c) => c.toggleTaskList())}>
          <Ic name="check" />
        </RTB>
      )}
      {quick && compact ? null : <i className="tp-rte-sep" />}
      <div className="tp-rte-dd">
        <RTB label="Link" expanded={menu === 'link'} onClick={() => setMenu(menu === 'link' ? null : 'link')}>
          <Ic name="link" />
        </RTB>
        {menu === 'link' ? (
          <div className="tp-rte-pop">
            <div className="tp-rte-link">
              <input
                autoFocus
                value={link}
                placeholder="Paste a link"
                aria-label="Link address"
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setMenu(null);
                    editor?.commands.focus();
                  }
                }}
              />
              <Button variant="quiet" onClick={applyLink}>
                Add
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {lvl >= 1 || lean ? null : (
        <RTB label="Highlight" onClick={() => exec((c) => c.toggleHighlight())}>
          <Ic name="mark" />
        </RTB>
      )}
      {lvl >= 2 || (quick && compact) ? null : (
        <RTB label="Code" onClick={() => exec((c) => c.toggleCode())}>
          <Ic name="code" />
        </RTB>
      )}
      {p.onAttach && (lvl < 3 || comment) ? (
        <RTB label="Attach a file" onClick={() => fileEl.current?.click()}>
          <Ic name="attach" />
        </RTB>
      ) : null}
      {p.onAttach ? (
        <input
          ref={fileEl}
          type="file"
          hidden
          tabIndex={-1}
          multiple
          aria-label="Choose a file to attach"
          onChange={(e) => {
            attachFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      ) : null}
      {p.drawings && !lean ? (
        <>
          <i className="tp-rte-sep" />
          <RTB label="Draw" wide className="tp-rte-draw" onClick={draw}>
            <PenIcon size={15} />
            <span>Draw</span>
          </RTB>
        </>
      ) : null}
      {quick ? null : <span className="tp-rte-sp" />}
      {lean ? null : (
        <div className="tp-rte-dd">
          <RTB
            label="More formatting"
            expanded={menu === 'more'}
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <Ic name="more" />
          </RTB>
          {menu === 'more' ? (
            <div className="tp-rte-pop tp-rte-pop-r">
              <MenuList
                label="More formatting"
                items={[
                  { label: 'Strikethrough', onSelect: () => more((c) => c.toggleStrike()) },
                  lvl >= 1 && { label: 'Underline', onSelect: () => more((c) => c.toggleUnderline()) },
                  lvl >= 1 && { label: 'Highlight', onSelect: () => more((c) => c.toggleHighlight()) },
                  lvl >= 2 && { label: 'Numbered list', onSelect: () => more((c) => c.toggleOrderedList()) },
                  lvl >= 2 && { label: 'Code', onSelect: () => more((c) => c.toggleCode()) },
                  lvl >= 3 && { label: 'Checklist', onSelect: () => more((c) => c.toggleTaskList()) },
                  lvl >= 3 &&
                    p.onAttach && {
                      label: 'Attach a file',
                      onSelect: () => {
                        setMenu(null);
                        fileEl.current?.click();
                      },
                    },
                  { label: 'Superscript', onSelect: () => more((c) => c.toggleSuperscript()) },
                  { label: 'Subscript', onSelect: () => more((c) => c.toggleSubscript()) },
                  { label: 'Align left', onSelect: () => more((c) => c.setTextAlign('left')) },
                  { label: 'Align centre', onSelect: () => more((c) => c.setTextAlign('center')) },
                  { label: 'Divider', onSelect: () => more((c) => c.setHorizontalRule()) },
                  { label: 'Clear formatting', onSelect: () => more((c) => c.unsetAllMarks().clearNodes()) },
                  { label: 'Undo', onSelect: () => more((c) => c.undo()) },
                  { label: 'Redo', onSelect: () => more((c) => c.redo()) },
                ]}
              />
            </div>
          ) : null}
        </div>
      )}
      {comment && p.onSubmit ? (
        <Button variant="primary" className="tp-rte-send" disabled={empty || uploading > 0} onClick={submit}>
          {p.submitLabel ?? 'Comment'}
        </Button>
      ) : null}
      {comment && p.onCancel ? (
        <Button variant="quiet" className="tp-rte-cancel" onClick={p.onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );

  function more(fn: (c: ReturnType<Editor['chain']>) => { run: () => boolean }) {
    setMenu(null);
    exec(fn);
  }

  return (
    <div
      ref={wrap}
      className={cx(
        'tp-root tp-rte',
        comment ? 'tp-rte-comment' : quick ? 'tp-rte-quick' : 'tp-rte-notes',
        onNow && 'tp-on',
        empty && 'tp-rte-blank',
        compact && 'tp-compact',
        dragging > 0 && 'tp-rte-dropping',
        p.className,
      )}
      onKeyDown={onKeyDown}
      onDragEnter={(e) => {
        if (p.onAttach && hasFiles(e.dataTransfer)) setDragging((d) => d + 1);
      }}
      onDragLeave={(e) => {
        if (p.onAttach && hasFiles(e.dataTransfer)) setDragging((d) => Math.max(0, d - 1));
      }}
      onDragOver={(e) => {
        // Files may land anywhere on the field, not only on its words.
        if (p.onAttach && hasFiles(e.dataTransfer)) e.preventDefault();
      }}
      onDrop={(e) => {
        setDragging(0);
        // Off the words (the padding, below the last line) the editor has no place for it: it goes at the caret.
        if (e.defaultPrevented || !p.onAttach || !e.dataTransfer?.files.length) return;
        e.preventDefault();
        attachFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {lean ? null : bar}
      <EditorContent editor={editor} className="tp-rte-host" />
      {p.onAttach ? (
        <div className="tp-rte-drop" aria-hidden="true">
          <Ic name="attach" />
          <span>Drop to attach · it goes where the caret is</span>
        </div>
      ) : null}
      {lean ? bar : null}
    </div>
  );
}

export interface RichTextContentProps {
  html: string;
  compact?: boolean;
  /** Where attachment chips link: the API's origin. */
  fileBase?: string;
  className?: string;
}

/** The same writing, read-only (comments). The HTML is cleaned again here, so nothing but words ever renders. */
export function RichTextContent({ html, compact, fileBase, className }: RichTextContentProps) {
  return (
    <div
      className={cx('tp-root tp-prose', compact && 'tp-compact', className)}
      dangerouslySetInnerHTML={{ __html: withFileBase(upgradeChips(cleanHtml(toHtml(html))), fileBase) }}
    />
  );
}
