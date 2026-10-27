import { useNavigate } from '@tanstack/react-router';
import { syncThemeChoice, useTheme, type NoteResizeEdge } from '@tudu/ui';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { desktop, type NoteWindowState } from '../../app/desktop';
import { useLiveEvents } from '../../app/live';
import { leaveWindow, showInWindow } from '../../app/notebook';
import { NoteWindowView } from '../../app/NoteWindowView';
import { WorkingDayProvider } from '../../app/workingDay';
import './notebook.css';

/**
 * The note window alone, at /note-window (and /note-window/<id>): the Mac app's own note window holds it, and the app
 * says which note to show each time it opens the window. It paints your theme and follows it live. Opened in a
 * browser (an old bookmark, or the popup ↗ used to open) it takes you to the note on the Notebook page.
 */
export function NoteWindowPage({ noteId }: { noteId?: string }) {
  const d = desktop();
  const mac = d?.window === 'note';
  if (!mac || !d) return <ToNotebook noteId={noteId} />;
  return <MacNoteWindow />;
}

function ToNotebook({ noteId }: { noteId?: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ href: noteId ? `/notebook/${encodeURIComponent(noteId)}` : '/notebook', replace: true });
  }, [navigate, noteId]);
  return null;
}

/**
 * Resize from an edge or corner: the app takes the frame as the pointer goes down, then follows how far the pointer
 * has moved on the screen (the window moves under it on the top and left edges), once a frame.
 */
function resizeFrom(e: PointerEvent<HTMLElement>, edge: NoteResizeEdge): void {
  const d = desktop()!;
  e.preventDefault();
  e.currentTarget.setPointerCapture?.(e.pointerId);
  const sx = e.screenX;
  const sy = e.screenY;
  let next: [number, number] | null = null;
  let frame = 0;
  d.beginResize();
  const move = (ev: globalThis.PointerEvent) => {
    next = [ev.screenX - sx, ev.screenY - sy];
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (next) d.resizeTo(edge, next[0], next[1]);
    });
  };
  const up = (ev: globalThis.PointerEvent) => {
    cancelAnimationFrame(frame);
    d.resizeTo(edge, ev.screenX - sx, ev.screenY - sy);
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function MacNoteWindow() {
  useLiveEvents(true);
  // The theme picked on the desk, live (the storage event), and on every open (a hidden window may miss it).
  useTheme();
  const d = desktop()!;
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    let on = true;
    const take = (s: NoteWindowState) => {
      if (!on) return;
      setPinned(s.pinned);
      setExpanded(s.expanded);
      // Each time the app opens the window it says what for, once.
      if (s.ask && s.ask.nonce !== seen.current) {
        seen.current = s.ask.nonce;
        showInWindow(s.ask.id, s.ask.linkTo ?? undefined);
      }
    };
    void d.noteState().then(take);
    const stop = d.on('note:open', (payload) => {
      syncThemeChoice();
      take(payload as NoteWindowState);
    });
    return () => {
      on = false;
      stop();
    };
  }, [d]);

  return (
    <WorkingDayProvider>
      <div className="tp-root app-note-window app-note-mac">
        <NoteWindowView
          variant="mac"
          pinned={pinned}
          expanded={expanded}
          onPin={() => void d.setNotePinned(!pinned).then(setPinned)}
          onExpand={() => void d.setNoteExpanded(!expanded).then(setExpanded)}
          onDragStart={(e) => {
            if (e.button === 0 && !(e.target as Element).closest('button')) d.startDragging();
          }}
          onResizeStart={(e, edge) => {
            if (e.button === 0) resizeFrom(e, edge);
          }}
          onClose={() => {
            leaveWindow();
            // Closing unpins it (the app does too): it always opens unpinned.
            setPinned(false);
            d.hideNote();
          }}
          onOpenApp={(id) => {
            leaveWindow();
            setPinned(false);
            d.openInNotebook(id);
          }}
          openPath={(path) => d.showMain(path)}
          // Make a task: the floating New task bar (⌘⇧N) comes up over every app, filled in; the desk stays put.
          makeTask={(seed) => d.summonWith(seed)}
        />
      </div>
    </WorkingDayProvider>
  );
}
