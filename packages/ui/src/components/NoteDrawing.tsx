import { Extension, mergeAttributes, Node } from '@tiptap/core';
import { NodeSelection, type TextSelection } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useTheme } from '../lib/theme';
import { MenuList } from './Menu';
import { showToast, TOAST_WITH_ACTION_MS } from './Toast';

/** A drawing block's picture: the light and dark PNGs (as addresses) and how many words it holds. */
export interface NoteDrawingPicture {
  light: string | null;
  dark: string | null;
  words: number;
}

/** What the note around the blocks gives them: their pictures, and opening one full size. */
export interface NoteDrawingHost {
  picture: (id: string) => NoteDrawingPicture | undefined;
  onOpen: (id: string, from: DOMRect | null) => void;
  /** The drawing open full size (its block hides under the sheet). */
  openId?: string | null;
  /** Blocks just made here: they grow into place. */
  fresh?: ReadonlySet<string>;
}

export const DrawingContext = createContext<NoteDrawingHost | null>(null);

export const DRAWING_DELETED = 'Drawing deleted.';

/** Where a drawing's block shows its picture now, inside `root`. */
export function drawingFrame(root: ParentNode | null | undefined, id: string): DOMRect | null {
  if (!root || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return root.querySelector(`[data-drawing-id="${id}"] .tp-nb-draw-pic`)?.getBoundingClientRect() ?? null;
}

export interface NoteDrawingProps {
  id: string;
  picture?: NoteDrawingPicture;
  dark?: boolean;
  /** Its block is selected in the note (a ring). */
  selected?: boolean;
  /** Open full size: the block keeps its place, hidden. */
  open?: boolean;
  fresh?: boolean;
  onOpen?: (from: DOMRect | null) => void;
  onDelete?: () => void;
  children?: ReactNode;
}

/**
 * A drawing in a note: its picture, as wide as the words and up to 360px tall. Pointing at it shows Edit and ⋯
 * (Delete drawing); a click or Enter opens it full size. Without a picture yet it says so, with its word count.
 */
export function NoteDrawing(p: NoteDrawingProps) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as globalThis.Node)) setMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);
  const src = p.picture ? (p.dark ? (p.picture.dark ?? p.picture.light) : p.picture.light) : null;
  const words = p.picture?.words ?? 0;
  const open = () => p.onOpen?.(box.current?.getBoundingClientRect() ?? null);
  return (
    <div
      ref={wrap}
      className={cx(
        'tp-nb-draw',
        p.selected && 'tp-sel',
        p.open && 'tp-nb-draw-open',
        p.fresh && 'tp-nb-draw-new',
      )}
      data-drawing-id={p.id}
    >
      <div
        ref={box}
        className="tp-nb-draw-pic"
        role="button"
        tabIndex={0}
        aria-label="Open the drawing"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            open();
          }
        }}
      >
        {src ? (
          <img
            src={src}
            alt={words ? `Drawing, ${words} ${words === 1 ? 'word' : 'words'}` : 'Drawing'}
            draggable={false}
          />
        ) : (
          <div className="tp-nb-draw-none">
            <span>Picture not ready</span>
            <span className="tp-nb-draw-sub">
              {words ? `${words} ${words === 1 ? 'word' : 'words'} · ` : ''}It’s made the next time you open
              it.
            </span>
          </div>
        )}
      </div>
      <div className="tp-nb-draw-ctl" contentEditable={false}>
        <button type="button" className="tp-nb-draw-btn" onClick={open}>
          <PenIcon />
          Edit
        </button>
        <span className="tp-nb-draw-menuw">
          <button
            type="button"
            className="tp-nb-draw-btn tp-nb-draw-ic"
            aria-label="Drawing options"
            aria-expanded={menu ? 'true' : 'false'}
            onClick={() => setMenu(!menu)}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx={5} cy={12} r={1.6} />
              <circle cx={12} cy={12} r={1.6} />
              <circle cx={19} cy={12} r={1.6} />
            </svg>
          </button>
          {menu ? (
            <div className="tp-nb-draw-menu">
              <MenuList
                label="Drawing options"
                items={[
                  {
                    label: 'Delete drawing',
                    danger: true,
                    onSelect: () => {
                      setMenu(false);
                      p.onDelete?.();
                    },
                  },
                ]}
              />
            </div>
          ) : null}
        </span>
      </div>
      {p.children}
    </div>
  );
}

export function PenIcon({ size = 14 }: { size?: number }) {
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
      <path d="M4 20c4-1 6-14 10-14s2 9 6 8" />
    </svg>
  );
}

/** The block inside the editor: its picture comes from the note around it. */
function DrawingBlockView(props: NodeViewProps) {
  const host = useContext(DrawingContext);
  const { theme } = useTheme();
  const id = String(props.node.attrs.id ?? '');
  return (
    <NodeViewWrapper className="tp-nb-draw-node" data-drag-handle="">
      <NoteDrawing
        id={id}
        picture={host?.picture(id)}
        dark={theme === 'dark'}
        selected={props.selected}
        open={host?.openId === id}
        fresh={host?.fresh?.has(id)}
        onOpen={(from) => host?.onOpen(id, from)}
        onDelete={() => {
          const editor = props.editor;
          props.deleteNode();
          showToast(DRAWING_DELETED, {
            action: 'Undo',
            duration: TOAST_WITH_ACTION_MS,
            onAction: () => editor.commands.undo(),
          });
        }}
      />
    </NodeViewWrapper>
  );
}

/**
 * Backspace just after a drawing selects it, so a second one deletes it. Its own extension, above the core keymap
 * (whose joinBackward deletes an atom outright): a priority on the node itself would put it first in the schema and
 * make it the default block.
 */
const DrawingKeys = Extension.create({
  name: 'drawingKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $cursor } = editor.state.selection as TextSelection;
        if (!$cursor || $cursor.parentOffset > 0 || $cursor.depth < 1) return false;
        const at = $cursor.before();
        const before = editor.state.doc.resolve(at).nodeBefore;
        if (before?.type.name !== 'drawing') return false;
        editor.view.dispatch(
          editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at - before.nodeSize)),
        );
        return true;
      },
    };
  },
});

/**
 * A drawing block in a note's words: `<div data-drawing="id"></div>`, nothing else. The drawing itself lives in its
 * own row; the block is one unit in the words (arrows step over it, Backspace selects it then deletes it, it drags
 * like a paragraph). Enter on a selected block opens it.
 */
export const DrawingNode = Node.create<{ onOpen: (id: string) => void }>({
  name: 'drawing',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return { onOpen: () => {} };
  },
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-drawing'),
        renderHTML: (attrs) => ({ 'data-drawing': attrs.id }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-drawing]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DrawingBlockView);
  },
  addExtensions() {
    return [DrawingKeys];
  },
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const sel = editor.state.selection;
        if (!(sel instanceof NodeSelection) || sel.node.type.name !== this.name) return false;
        this.options.onOpen(String(sel.node.attrs.id));
        return true;
      },
    };
  },
});
