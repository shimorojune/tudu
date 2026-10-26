import { useNavigate } from '@tanstack/react-router';
import { NoteFloat } from '@tudu/ui';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { desktop } from './desktop';
import {
  closeNoteWindow,
  fitFrame,
  NOTE_WINDOW_MIN,
  readFrame,
  saveFrame,
  useNoteWindow,
  type WindowFrame,
} from './notebook';
import { NoteWindowView } from './NoteWindowView';
import { useViewport } from './viewport';

/** The popup a note opens in (↗): the bare note window page, at a size to write in. */
export function popOut(id: string | null): void {
  const url = `/note-window${id ? `/${encodeURIComponent(id)}` : ''}`;
  const w = window.open(url, 'tudu-note', 'popup,width=640,height=520');
  // Popups blocked: a tab of its own.
  if (!w) window.open(url, '_blank');
}

/**
 * The note window over the page, on the desk in the browser: it opens from a note in the task panel, from Search and
 * from New note, floats over everything (an open task panel too), drags by its bar and keeps its place and size per
 * browser. The Mac app has its own window instead, and phones open the note's page.
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
  if (vp === 'phone' || desktop()) return null;

  const start = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    drag.current = { sx: e.clientX, sy: e.clientY, from: frame };
    const move = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      setFrame(
        fitFrame(
          { ...d.from, x: d.from.x + ev.clientX - d.sx, y: d.from.y + ev.clientY - d.sy },
          window.innerWidth,
          window.innerHeight,
        ),
      );
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
        onClose={closeNoteWindow}
        onOpenApp={popOut}
        openPath={(href) => void navigate({ href })}
      />
    </NoteFloat>
  );
}
