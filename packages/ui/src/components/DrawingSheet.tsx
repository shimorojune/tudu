import { FILE_MAX_BYTES, type DrawingImage, type DrawingScene } from '@tudu/core';
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { useTheme } from '../lib/theme';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { reducedMotion, SaveState, type NoteSaveState } from './NoteParts';
import { showToast, TOAST_WITH_ACTION_MS } from './Toast';

/** Opening clips out from the block to the whole pane; closing clips back onto it. Never scaled (see below). */
export const SHEET_OPEN_MS = 240;
export const SHEET_CLOSE_MS = 220;
/** The note's pictures are at most this wide, at twice the block's size. */
export const PICTURE_MAX_PX = 1600;

const IMAGE_FAILED = 'Couldn’t upload the image. Check your connection and retry.';
const IMAGE_TOO_BIG = 'That image is too big. Images can be up to 25 MB.';

/** An element of a drawing, as much of it as Tudu reads. */
interface Element {
  id: string;
  type: string;
  version: number;
  isDeleted?: boolean;
  fileId?: string | null;
}
interface BinaryFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}
/** The few calls Tudu makes on a live Excalidraw. */
interface ExcalidrawApi {
  getSceneElementsIncludingDeleted: () => readonly Element[];
  getFiles: () => Record<string, BinaryFile>;
  updateScene: (s: { elements: readonly Element[] }) => void;
  addFiles: (files: BinaryFile[]) => void;
  refresh: () => void;
}
/** What Tudu uses of the Excalidraw package, loaded only when a drawing opens. */
export interface ExcalidrawModule {
  Excalidraw: ComponentType<Record<string, unknown>>;
  exportToBlob: (opts: Record<string, unknown>) => Promise<Blob>;
  restoreElements: (els: readonly Element[], local: null, opts: Record<string, unknown>) => Element[];
}

/** Where Excalidraw's fonts are served from: this app's own files, never a CDN. */
export const EXCALIDRAW_ASSETS = '/excalidraw/';

let loading: Promise<ExcalidrawModule> | null = null;
/** Load Excalidraw (its own chunk) once; a failed load can be tried again. */
export function loadExcalidraw(): Promise<ExcalidrawModule> {
  if (!loading) {
    const w = window as unknown as { EXCALIDRAW_ASSET_PATH?: string };
    w.EXCALIDRAW_ASSET_PATH ??= new URL(EXCALIDRAW_ASSETS, window.location.href).href;
    loading = Promise.all([import('@excalidraw/excalidraw'), import('@excalidraw/excalidraw/index.css')])
      .then(([m]) => m as unknown as ExcalidrawModule)
      .catch((err: unknown) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}

export interface DrawingPictures {
  light: Blob;
  dark: Blob;
}

export interface DrawingSheetProps {
  /** The note's name, for the bar: "Offsite floor plan · Drawing 2". */
  noteName: string;
  /** Which drawing of the note this is, counted from the top. */
  number: number;
  /** The drawing to show; `gen` moves when it was replaced (a newer one from another window). */
  drawing: { id: string; scene: DrawingScene; gen: number } | null;
  /** It didn't load. */
  error?: boolean;
  onRetry?: () => void;
  /** An image of the drawing, as a data URL. */
  loadImage: (attachmentId: string) => Promise<string>;
  /** Upload an image put into the drawing; it comes back as a Notebook file. */
  upload: (file: File) => Promise<{ id: string }>;
  /** Saves wait while something is held; call what comes back to let go. */
  hold: () => () => void;
  onChange: (scene: DrawingScene) => void;
  /** Done or back: whether anything is drawn, and the pictures for the note (none when empty or they failed). */
  onDone: (out: { empty: boolean; pictures: DrawingPictures | null }) => void;
  save?: NoteSaveState;
  slow?: boolean;
  /** The block's frame: the sheet opens from it. */
  from?: DOMRect | null;
  /** Where the block is now, for closing onto it. */
  closeTo?: () => DOMRect | null;
  /** For tests: Excalidraw itself. */
  load?: () => Promise<ExcalidrawModule>;
  className?: string;
}

const live = (els: readonly Element[]) => els.filter((e) => !e.isDeleted);

/** A clip from the sheet's own box down onto `r` (or the whole box when null). */
function inset(box: DOMRect, r: DOMRect | null, radius: number): string {
  if (!r) return 'inset(0px 0px 0px 0px round 0px)';
  const top = Math.max(0, r.top - box.top);
  const right = Math.max(0, box.right - r.right);
  const bottom = Math.max(0, box.bottom - r.bottom);
  const left = Math.max(0, r.left - box.left);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
}

function dataUrlToFile(url: string, mimeType: string, name: string): File {
  const [, b64 = ''] = url.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mimeType });
}

/** Excalidraw for one drawing (and one generation of it): its images' files and its change detection live here. */
function Canvas(p: {
  mod: ExcalidrawModule;
  drawing: { id: string; scene: DrawingScene };
  dark: boolean;
  cb: { current: DrawingSheetProps };
  onReady: (api: ExcalidrawApi) => void;
}) {
  const { mod, cb, onReady } = p;
  /** Each image's Notebook file, by Excalidraw's id for it. */
  const files = useRef(new Map<string, DrawingImage>(Object.entries(p.drawing.scene.files)));
  const sending = useRef(new Set<string>());
  const lastSig = useRef('');
  const api = useRef<ExcalidrawApi | null>(null);
  const [initial] = useState(() => ({
    elements: p.drawing.scene.elements,
    appState: { viewBackgroundColor: 'transparent' },
    scrollToContent: true,
  }));
  const [want] = useState(() => Object.entries(p.drawing.scene.files));

  /** The scene as stored: live elements, and the files of the images they show that have landed. */
  const sceneOf = useCallback((els: readonly Element[]): DrawingScene => {
    const keep = live(els);
    const out: Record<string, DrawingImage> = {};
    for (const e of keep) {
      const f = e.fileId ? files.current.get(e.fileId) : undefined;
      if (e.fileId && f) out[e.fileId] = f;
    }
    return { elements: keep as unknown as DrawingScene['elements'], files: out };
  }, []);

  const emit = useCallback(() => {
    const a = api.current;
    if (a) cb.current.onChange(sceneOf(a.getSceneElementsIncludingDeleted()));
  }, [cb, sceneOf]);

  /** An image put into the drawing goes up to the Notebook's files; saves wait for it. */
  const sendImage = useCallback(
    function send(f: BinaryFile) {
      if (sending.current.has(f.id) || files.current.has(f.id)) return;
      const file = dataUrlToFile(f.dataURL, f.mimeType, `Drawing image.${f.mimeType.split('/')[1] ?? 'png'}`);
      if (file.size > FILE_MAX_BYTES) {
        showToast(IMAGE_TOO_BIG);
        return;
      }
      sending.current.add(f.id);
      const release = cb.current.hold();
      cb.current.upload(file).then(
        (saved) => {
          sending.current.delete(f.id);
          files.current.set(f.id, { attachmentId: saved.id, mimeType: f.mimeType });
          emit();
          release();
        },
        () => {
          sending.current.delete(f.id);
          release();
          showToast(IMAGE_FAILED, {
            action: 'Try again',
            duration: TOAST_WITH_ACTION_MS,
            onAction: () => send(f),
          });
        },
      );
    },
    [cb, emit],
  );

  const onChange = useCallback(
    (els: readonly Element[], _app: unknown, bin: Record<string, BinaryFile> | undefined) => {
      for (const f of Object.values(bin ?? {})) if (!files.current.has(f.id)) sendImage(f);
      // Excalidraw calls this on every pointer move; only a changed element is a change.
      const sig = `${els.length}:${els.reduce((n, e) => n + e.version, 0)}:${files.current.size}`;
      if (sig === lastSig.current) return;
      const first = lastSig.current === '';
      lastSig.current = sig;
      if (!first) cb.current.onChange(sceneOf(els));
    },
    [cb, sceneOf, sendImage],
  );

  const onApi = useCallback(
    (a: ExcalidrawApi) => {
      if (!a || api.current === a) return;
      api.current = a;
      onReady(a);
      // The images of the drawing as it opens, from its files.
      for (const [fileId, f] of want)
        cb.current.loadImage(f.attachmentId).then(
          (dataURL) => a.addFiles([{ id: fileId, mimeType: f.mimeType, dataURL, created: Date.now() }]),
          () => {},
        );
      // Words measured before the hand-drawn font arrived come out clipped: measure them again once it's in.
      void document.fonts?.ready.then(() =>
        setTimeout(() => {
          const els = a.getSceneElementsIncludingDeleted();
          if (els.some((e) => e.type === 'text'))
            a.updateScene({
              elements: mod.restoreElements(els, null, { refreshDimensions: true, repairBindings: true }),
            });
        }, 250),
      );
    },
    [cb, mod, onReady, want],
  );

  return createElement(mod.Excalidraw, {
    excalidrawAPI: onApi,
    initialData: initial,
    theme: p.dark ? 'dark' : 'light',
    onChange,
    autoFocus: true,
    UIOptions: {
      canvasActions: {
        loadScene: false,
        saveToActiveFile: false,
        export: false,
        saveAsImage: true,
        toggleTheme: false,
        changeViewBackgroundColor: false,
      },
    },
  });
}

/** Play an animation on `el`, resolved when it ends (at once where the page can't animate). */
function play(el: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
  if (typeof el.animate !== 'function') return Promise.resolve();
  return el.animate(frames, opts).finished.then(
    () => {},
    () => {},
  );
}

/**
 * A drawing full size, over the note: a thin Tudu bar (back, "‹note› · Drawing N", the save ring, Done) and
 * Excalidraw under it, loaded the first time a drawing opens. Images pasted or dropped in upload to the Notebook's
 * files; the scene keeps only which file each one is. It opens by clipping out from the block and closes by clipping
 * back onto it: Excalidraw measures its own box, so scaling it would switch it to its phone layout and misplace the
 * pointer.
 */
export function DrawingSheet(p: DrawingSheetProps) {
  const { theme } = useTheme();
  const sheet = useRef<HTMLDivElement | null>(null);
  const api = useRef<ExcalidrawApi | null>(null);
  const modRef = useRef<ExcalidrawModule | null>(null);
  const [mod, setMod] = useState<ExcalidrawModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cb = useRef(p);
  useLayoutEffect(() => {
    cb.current = p;
  });
  const onReady = useCallback((a: ExcalidrawApi) => {
    api.current = a;
  }, []);

  useEffect(() => {
    let gone = false;
    (cb.current.load ?? loadExcalidraw)().then(
      (m) => {
        modRef.current = m;
        if (!gone) setMod(() => m);
      },
      () => !gone && setFailed(true),
    );
    return () => {
      gone = true;
    };
  }, [attempt]);

  // Clip out from the block to the whole pane. Less motion: there at once.
  useLayoutEffect(() => {
    const el = sheet.current;
    const from = cb.current.from;
    if (!el || reducedMotion() || !from) return;
    const box = el.getBoundingClientRect();
    void play(
      el,
      [
        { clipPath: inset(box, from, 12), opacity: 0.6 },
        { clipPath: inset(box, null, 0), opacity: 1 },
      ],
      { duration: SHEET_OPEN_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
    ).then(() => api.current?.refresh());
  }, []);

  async function pictures(): Promise<{ empty: boolean; pictures: DrawingPictures | null }> {
    const a = api.current;
    const m = modRef.current;
    const els = a
      ? live(a.getSceneElementsIncludingDeleted())
      : live((p.drawing?.scene.elements ?? []) as unknown as Element[]);
    if (!els.length) return { empty: true, pictures: null };
    if (!a || !m) return { empty: false, pictures: null };
    const make = (dark: boolean) =>
      m.exportToBlob({
        elements: els,
        files: a.getFiles(),
        mimeType: 'image/png',
        exportPadding: 16,
        appState: { exportBackground: false, exportWithDarkMode: dark, viewBackgroundColor: 'transparent' },
        getDimensions: (w: number, h: number) => {
          const scale = Math.min(2, PICTURE_MAX_PX / Math.max(1, w));
          return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
        },
      });
    try {
      const [light, dark] = await Promise.all([make(false), make(true)]);
      return { empty: false, pictures: { light, dark } };
    } catch {
      return { empty: false, pictures: null };
    }
  }

  async function done() {
    if (leaving) return;
    setLeaving(true);
    const el = sheet.current;
    const close = (): Promise<void> => {
      if (!el || reducedMotion()) return Promise.resolve();
      const box = el.getBoundingClientRect();
      const to = p.closeTo?.() ?? null;
      return to
        ? play(
            el,
            [
              { clipPath: inset(box, null, 0), opacity: 1 },
              { clipPath: inset(box, to, 12), opacity: 0.5 },
            ],
            { duration: SHEET_CLOSE_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
          )
        : play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    };
    const [out] = await Promise.all([pictures(), close()]);
    p.onDone(out);
  }

  const name = p.noteName.trim() || 'Untitled';
  const drawing = p.drawing;
  const ready = !!mod && !!drawing && !failed && !p.error;
  return (
    <div
      ref={sheet}
      className={cx('tp-root tp-nb-sheet', leaving && 'tp-nb-sheet-leaving', p.className)}
      role="dialog"
      aria-label={`Drawing ${p.number}`}
      data-drawing-sheet={drawing?.id ?? ''}
    >
      <div className="tp-nb-sheet-bar">
        <IconButton label="Back to the note" tipSide="bottom" onClick={() => void done()}>
          <Icon name="left" size={17} />
        </IconButton>
        <span className="tp-nb-sheet-where">
          <span className="tp-nb-sheet-note">{name}</span>
          <span aria-hidden="true"> · </span>
          <b>Drawing {p.number}</b>
        </span>
        <SaveState state={p.save} slow={p.slow} />
        <Button variant="primary" className="tp-nb-sheet-done" onClick={() => void done()}>
          Done
        </Button>
      </div>
      <div className="tp-nb-sheet-canvas" aria-busy={ready ? undefined : 'true'}>
        {failed || p.error ? (
          <div className="tp-nb-sheet-err" role="alert">
            <span className="tp-nb-sheet-err-t">This drawing didn’t open.</span>
            <span>Nothing in it is lost. Check your connection and try again.</span>
            <Button
              variant="quiet"
              onClick={() => {
                if (failed) {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }
                p.onRetry?.();
              }}
            >
              Try again
            </Button>
          </div>
        ) : ready ? (
          <Canvas
            key={`${drawing.id}:${drawing.gen}`}
            mod={mod}
            drawing={drawing}
            dark={theme === 'dark'}
            cb={cb}
            onReady={onReady}
          />
        ) : (
          <div className="tp-nb-sheet-opening" aria-label="Opening the drawing">
            <span className="tp-nb-sheet-tools" />
          </div>
        )}
      </div>
    </div>
  );
}
