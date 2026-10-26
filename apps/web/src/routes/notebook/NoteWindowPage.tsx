import { useEffect, useRef, useState } from 'react';
import { desktop, type NoteWindowState } from '../../app/desktop';
import { useLiveEvents } from '../../app/live';
import { leaveWindow, showInWindow } from '../../app/notebook';
import { NoteWindowView } from '../../app/NoteWindowView';
import { WorkingDayProvider } from '../../app/workingDay';
import './notebook.css';

/**
 * The note window alone, at /note-window (and /note-window/<id>): the Mac app's own note window holds it, and in the
 * browser ↗ opens it in a popup. On the Mac the app says which note to show each time it opens the window.
 */
export function NoteWindowPage({ noteId }: { noteId?: string }) {
  useLiveEvents(true);
  const d = desktop();
  const mac = d?.window === 'note';
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const seen = useRef(0);

  useEffect(() => {
    if (!mac || !d) {
      // The popup: the note it was opened on.
      showInWindow(noteId ?? null);
      return;
    }
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
    const stop = d.on('note:open', (payload) => take(payload as NoteWindowState));
    return () => {
      on = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the window is set up once; the note it shows comes from the app
  }, [mac, d]);

  const view = mac ? (
    <NoteWindowView
      variant="mac"
      pinned={pinned}
      expanded={expanded}
      onPin={() => void d!.setNotePinned(!pinned).then(setPinned)}
      onExpand={() => void d!.setNoteExpanded(!expanded).then(setExpanded)}
      onDragStart={(e) => {
        if (e.button === 0 && !(e.target as Element).closest('button')) d!.startDragging();
      }}
      onResizeStart={(e) => {
        e.preventDefault();
        d!.startResizing();
      }}
      onClose={() => {
        leaveWindow();
        d!.hideNote();
      }}
      onOpenApp={(id) => {
        leaveWindow();
        d!.openInNotebook(id);
      }}
      openPath={(path) => d!.showMain(path)}
    />
  ) : (
    <NoteWindowView
      variant="web"
      rail={false}
      openLabel="Open in Tudu"
      onClose={() => {
        leaveWindow();
        window.close();
      }}
      onOpenApp={(id) => toOpener(id ? `/notebook/${encodeURIComponent(id)}` : '/notebook')}
      openPath={toOpener}
    />
  );
  return (
    <WorkingDayProvider>
      <div
        className={mac ? 'tp-root app-note-window app-note-mac' : 'tp-root app-note-window app-note-popup'}
      >
        {view}
      </div>
    </WorkingDayProvider>
  );
}

/** From the popup: the page in the Tudu tab that opened it, or a tab of its own. */
function toOpener(href: string): void {
  const opener = window.opener as Window | null;
  try {
    if (opener && !opener.closed) {
      opener.location.href = href;
      opener.focus();
      return;
    }
  } catch {
    /* another origin: a tab of its own */
  }
  window.open(href, '_blank');
}
