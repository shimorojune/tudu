import { cleanHtml, isEmptyHtml as htmlIsEmpty } from '@tudu/core';
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
  /** Notes sit in the paper with a toolbar that rises over them; a comment is a box that grows as you write. */
  variant: 'notes' | 'comment';
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
  /** Comments: the button at the end of the toolbar, or Cmd/Ctrl with Enter. */
  onSubmit?: (html: string) => void;
  submitLabel?: string;
  onCancel?: () => void;
  className?: string;
}

/** Plain words become paragraphs; HTML stays HTML. */
export function toHtml(v: string | undefined): string {
  if (!v) return '';
  if (/<\/?[a-z][\s\S]*>/i.test(v)) return v;
  return v
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

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
  onClick: () => void;
  children: ReactNode;
}

/** A toolbar button: pressing it never takes the selection away from the words. */
function RTB({ label, on, wide, toggle, expanded, onClick, children }: BProps) {
  return (
    <button
      type="button"
      className={cx('tp-rte-b', on && 'tp-on', wide && 'tp-wide')}
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

/** The editor's extensions: exactly what the cleaner keeps. */
export function editorExtensions() {
  return [
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
 * Notes and comments are rich text on Tiptap. The editor reads as part of the paper: no frame until you write,
 * then a slim toolbar of the few marks people use (text style, bold, italic, underline, lists, checklist, link,
 * highlight, code), the rest under More. When the toolbar would overflow, the least used marks fold into More.
 * Attaching a file arrives with chunk 04.
 */
export function RichTextEditor(p: RichTextEditorProps) {
  const comment = p.variant === 'comment';
  const wrap = useRef<HTMLDivElement | null>(null);
  const barEl = useRef<HTMLDivElement | null>(null);
  const lastW = useRef(0);
  const [fit, setFit] = useState(0);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(() => htmlIsEmpty(toHtml(p.value)));
  const [menu, setMenu] = useState<null | 'style' | 'link' | 'more'>(null);
  const [link, setLink] = useState('');
  const cb = useRef(p);
  useLayoutEffect(() => {
    cb.current = p;
  });

  const editor = useEditor(
    {
      extensions: editorExtensions(),
      content: toHtml(p.value),
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
      },
      onUpdate: ({ editor: e }) => {
        const em = e.isEmpty;
        setEmpty(em);
        cb.current.onInput?.(e.getHTML(), em);
      },
      onFocus: () => setFocused(true),
      onBlur: ({ editor: e }) => {
        setFocused(false);
        cb.current.onBlur?.(e.isEmpty ? '' : e.getHTML(), e.isEmpty);
      },
    },
    [p.resetKey],
  );
  // A reset loads other words: the blank state follows them.
  const [seenReset, setSeenReset] = useState(p.resetKey);
  if (p.resetKey !== seenReset) {
    setSeenReset(p.resetKey);
    setEmpty(htmlIsEmpty(toHtml(p.value)));
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
  const lvl = Math.max(fit, compact ? 2 : 0);
  // Measured after every render, since what the bar shows changes its width; it settles within three steps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const b = barEl.current;
    if (b && fit < 3 && b.clientWidth > 0 && b.scrollWidth > b.clientWidth + 1) setFit(fit + 1);
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
    p.onSubmit(cleanHtml(editor.getHTML()));
    // The box empties and keeps the caret, ready for the next comment.
    editor.chain().clearContent(true).focus().run();
    setEmpty(true);
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
    if (comment && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  const styleLabel = (STYLES.find((x) => x.v === act.block) ?? STYLES[0]).label;
  const onNow = focused || !!menu || (comment && !empty) || !!p.alwaysOpen;

  const bar = (
    <div ref={barEl} className="tp-rte-bar" role="toolbar" aria-label={`${p.label} formatting`}>
      {comment ? null : (
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
      {comment ? null : <i className="tp-rte-sep" />}
      <RTB label="Bold" toggle on={act.bold} onClick={() => exec((c) => c.toggleBold())}>
        <Ic name="bold" />
      </RTB>
      <RTB label="Italic" toggle on={act.italic} onClick={() => exec((c) => c.toggleItalic())}>
        <Ic name="italic" />
      </RTB>
      {lvl >= 1 || comment ? null : (
        <RTB label="Underline" toggle on={act.underline} onClick={() => exec((c) => c.toggleUnderline())}>
          <Ic name="underline" />
        </RTB>
      )}
      <i className="tp-rte-sep" />
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
      <i className="tp-rte-sep" />
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
      {lvl >= 1 || comment ? null : (
        <RTB label="Highlight" onClick={() => exec((c) => c.toggleHighlight())}>
          <Ic name="mark" />
        </RTB>
      )}
      {lvl >= 2 ? null : (
        <RTB label="Code" onClick={() => exec((c) => c.toggleCode())}>
          <Ic name="code" />
        </RTB>
      )}
      <span className="tp-rte-sp" />
      {comment ? null : (
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
        <Button variant="primary" className="tp-rte-send" disabled={empty} onClick={submit}>
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
        comment ? 'tp-rte-comment' : 'tp-rte-notes',
        onNow && 'tp-on',
        empty && 'tp-rte-blank',
        compact && 'tp-compact',
        p.className,
      )}
      onKeyDown={onKeyDown}
    >
      {comment ? null : bar}
      <EditorContent editor={editor} className="tp-rte-host" />
      {comment ? bar : null}
    </div>
  );
}

export interface RichTextContentProps {
  html: string;
  compact?: boolean;
  className?: string;
}

/** The same writing, read-only (comments). The HTML is cleaned again here, so nothing but words ever renders. */
export function RichTextContent({ html, compact, className }: RichTextContentProps) {
  return (
    <div
      className={cx('tp-root tp-prose', compact && 'tp-compact', className)}
      dangerouslySetInnerHTML={{ __html: cleanHtml(toHtml(html)) }}
    />
  );
}
