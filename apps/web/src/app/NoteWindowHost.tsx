import { useNavigate } from '@tanstack/react-router';
import { NoteFloat, type NoteResizeEdge } from '@tudu/ui';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { desktop } from './desktop';
import {
  closeNoteWindow,
  fitFrame,
  NOTE_WINDOW_MIN,
  noteWindowFallback,
  readFrame,
  resizeFrame,
  saveFrame,
  useNoteWindow,
  type WindowFrame,
} from './notebook';
import { NoteWindowView } from './NoteWindowView';
import { useViewport } from './viewport';

/**
 * The note window over the page, on the desk in the browser: it opens from a note in the task panel, from Search and
 * from New note, floats over everything (an open task panel too), drags by its bar, resizes from any edge or corner
 * and keeps its place and size per browser. The Tudu mark takes the tab to the note on the Notebook page. The Mac app
 * has its own window instead (unless it's too old to, then this one), and phones open the note's page.
 */
export function NoteWindowHost() {
  const vp = useViewport();
  const navigate = useNavigate();
  const { open } = useNoteWindow();
  const [frame, setFrame] = useState<WindowFrame>(() =>
    typeof window === 'undefined'
      ? { x: 0, y: 0, w: 600, h: 460 }
      : fitFrame(readFrame(), window.innerWidth, window.innerHeight),
  );
  const drag = useRef<{ sx: number; sy: number; from: WindowFrame } | null>(null);
  // The page got smaller: the window comes back inside it.
  useEffect(() => {
    const on = () => setFrame((f) => fitFrame(f, window.innerWidth, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (vp === 'phone' || (desktop() && !noteWindowFallback())) return null;

  /** Follow the pointer from here until it lets go, then keep where it ended. */
  const track = (e: PointerEvent<HTMLElement>, to: (from: WindowFrame, dx: number, dy: number) => WindowFrame) => {
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, from: frame };
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setFrame(to(d.from, ev.clientX - d.sx, ev.clientY - d.sy));
    };
    const up = () => {
      drag.current = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      setFrame((f) => {
        saveFrame(f);
        return f;
      });
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  const start = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    track(e, (from, dx, dy) =>
      fitFrame({ ...from, x: from.x + dx, y: from.y + dy }, window.innerWidth, window.innerHeight),
    );
  };
  const resize = (e: PointerEvent<HTMLElement>, edge: NoteResizeEdge) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    track(e, (from, dx, dy) => resizeFrame(from, edge, dx, dy, window.innerWidth, window.innerHeight));
  };

  return (
    <NoteFloat
      open={open}
      className="app-nb-float"
      style={{
        left: frame.x,
        top: frame.y,
        width: Math.max(NOTE_WINDOW_MIN.w, frame.w),
        height: Math.max(NOTE_WINDOW_MIN.h, frame.h),
      }}
    >
      <NoteWindowView
        variant="web"
        onDragStart={start}
        onResizeStart={resize}
        onClose={closeNoteWindow}
        onOpenApp={(id) => {
          closeNoteWindow();
          void navigate({ href: id ? `/notebook/${encodeURIComponent(id)}` : '/notebook' });
        }}
        openPath={(href) => void navigate({ href })}
      />
    </NoteFloat>
  );
}
