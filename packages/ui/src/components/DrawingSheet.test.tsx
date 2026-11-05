import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSheet, SHEET_OPEN_MS, type DrawingSheetProps, type ExcalidrawModule } from './DrawingSheet';

const ELEMENTS = [
  { id: 'r1', type: 'rectangle', version: 1 },
  { id: 't1', type: 'text', text: 'tables in a U', version: 1 },
];

/** A canvas as Excalidraw's export hands it over: two pixels of black ink, and a PNG of whatever it holds. */
function fakeCanvas() {
  const data = new Uint8ClampedArray([0x1e, 0x1e, 0x1e, 255, 0, 0, 0, 0]);
  const ctx = {
    getImageData: () => ({ data }),
    putImageData: vi.fn(),
  };
  return {
    width: 2,
    height: 1,
    data,
    getContext: () => ctx,
    toBlob: (cb: (b: Blob) => void) =>
      cb(new Blob([`dark:${Array.from(data).join(',')}`], { type: 'image/png' })),
  };
}

/** A stand-in for Excalidraw: it hands over its API and draws nothing. */
function fakeModule(elements: Array<Record<string, unknown>> = ELEMENTS) {
  const api = {
    getSceneElementsIncludingDeleted: () => elements,
    getFiles: () => ({}),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
    refresh: vi.fn(),
  };
  function Excalidraw(p: Record<string, unknown>) {
    useEffect(() => {
      (p.excalidrawAPI as (a: typeof api) => void)(api);
    }, [p.excalidrawAPI]);
    return <div data-testid="excalidraw" data-theme={String(p.theme)} />;
  }
  const mod = {
    Excalidraw,
    exportToBlob: vi.fn(async (o: Record<string, unknown>) => {
      const app = o.appState as { exportWithDarkMode: boolean };
      return new Blob([app.exportWithDarkMode ? 'dark' : 'light'], { type: 'image/png' });
    }),
    exportToCanvas: vi.fn(async () => fakeCanvas()),
    restoreElements: (els: unknown) => els,
  } as unknown as ExcalidrawModule;
  return { mod, api };
}

function props(extra: Partial<DrawingSheetProps> = {}): DrawingSheetProps {
  const { mod } = fakeModule();
  return {
    noteName: 'Offsite floor plan',
    number: 2,
    drawing: { id: 'd1', scene: { elements: ELEMENTS, files: {} }, gen: 0 },
    loadImage: vi.fn(async () => 'data:image/png;base64,AA=='),
    upload: vi.fn(async () => ({ id: 'att1' })),
    hold: () => () => {},
    onChange: vi.fn(),
    onDone: vi.fn(),
    save: 'saved',
    load: async () => mod,
    ...extra,
  };
}

let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  animate = vi.fn(() => ({ finished: Promise.resolve() }));
  (Element.prototype as unknown as { animate: unknown }).animate = animate;
});
afterEach(() => {
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete document.documentElement.dataset.motion;
});

describe('C22-U94 the drawing full size', () => {
  it('C22-U94 the bar says "‹note› · Drawing N", has the save ring and Done; Done hands over both pictures', async () => {
    const user = userEvent.setup();
    const p = props();
    render(<DrawingSheet {...p} />);
    expect(screen.getByRole('dialog', { name: 'Drawing 2' })).toBeInTheDocument();
    expect(screen.getByText('Offsite floor plan')).toBeInTheDocument();
    expect(screen.getByText('Drawing 2')).toBeInTheDocument();
    await screen.findByTestId('excalidraw');
    expect(screen.getByRole('button', { name: 'Back to the note' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalledTimes(1));
    const out = (p.onDone as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      empty: boolean;
      pictures: { light: Blob; dark: Blob };
    };
    expect(out.empty).toBe(false);
    expect(await out.pictures.light.text()).toBe('light');
    // Tudu's own flip of the light export: the ink came out light, the see-through pixel stayed see-through.
    expect(await out.pictures.dark.text()).toBe('dark:211,211,211,255,0,0,0,0');
  });

  it('C22-U94 Excalidraw loads lazily: the sheet shows Opening until it is in', async () => {
    let resolve!: (m: ExcalidrawModule) => void;
    const load = vi.fn(() => new Promise<ExcalidrawModule>((r) => (resolve = r)));
    render(<DrawingSheet {...props({ load })} />);
    expect(screen.getByLabelText('Opening the drawing')).toBeInTheDocument();
    expect(screen.queryByTestId('excalidraw')).toBeNull();
    await act(async () => resolve(fakeModule().mod));
    expect(await screen.findByTestId('excalidraw')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('C22-U94 when Excalidraw didn’t load it says so, and Try again loads it again', async () => {
    const user = userEvent.setup();
    const { mod } = fakeModule();
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValue(mod);
    render(<DrawingSheet {...props({ load })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('This drawing didn’t open.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('excalidraw')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('C22-U94 an empty drawing on Done is empty, with no pictures', async () => {
    const user = userEvent.setup();
    const { mod } = fakeModule([{ id: 'x', type: 'line', version: 2, isDeleted: true }]);
    const p = props({
      load: async () => mod,
      drawing: { id: 'd1', scene: { elements: [], files: {} }, gen: 0 },
    });
    render(<DrawingSheet {...p} />);
    await screen.findByTestId('excalidraw');
    await user.click(screen.getByRole('button', { name: 'Back to the note' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalledWith({ empty: true, pictures: null }));
  });
});

describe('C22-U95 how the sheet moves', () => {
  it('C22-U95 opens by animating clip-path from the block, never transform', async () => {
    const from = { top: 200, left: 40, right: 640, bottom: 460, width: 600, height: 260 } as DOMRect;
    render(<DrawingSheet {...props({ from })} />);
    await screen.findByTestId('excalidraw');
    expect(animate).toHaveBeenCalled();
    const [frames, opts] = animate.mock.calls[0]! as [Keyframe[], KeyframeAnimationOptions];
    expect(frames.every((f) => typeof f.clipPath === 'string')).toBe(true);
    expect(frames.some((f) => 'transform' in f || 'scale' in f)).toBe(false);
    expect(String(frames[1]!.clipPath)).toBe('inset(0px 0px 0px 0px round 0px)');
    expect(opts.duration).toBe(SHEET_OPEN_MS);
  });

  it('C22-U95 with Less motion there is no animation, opening or closing', async () => {
    document.documentElement.dataset.motion = 'less';
    const user = userEvent.setup();
    const from = { top: 200, left: 40, right: 640, bottom: 460, width: 600, height: 260 } as DOMRect;
    const p = props({ from, closeTo: () => from });
    render(<DrawingSheet {...p} />);
    await screen.findByTestId('excalidraw');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalled());
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('C22-U99 the dark picture is Tudu’s own (#55)', () => {
  it('C22-U99 Excalidraw is never asked for its dark export; the dark picture comes from its light canvas', async () => {
    const user = userEvent.setup();
    const { mod } = fakeModule();
    const p = props({ load: async () => mod });
    render(<DrawingSheet {...p} />);
    await screen.findByTestId('excalidraw');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalledTimes(1));
    const blob = mod.exportToBlob as ReturnType<typeof vi.fn>;
    expect(blob).toHaveBeenCalledTimes(1);
    expect(blob.mock.calls[0]![0].appState.exportWithDarkMode).toBe(false);
    const canvas = mod.exportToCanvas as ReturnType<typeof vi.fn>;
    expect(canvas).toHaveBeenCalledTimes(1);
    expect(canvas.mock.calls[0]![0].appState).toMatchObject({
      exportWithDarkMode: false,
      exportBackground: false,
    });
  });
});

describe('C22-U100 when a picture can’t be made', () => {
  it('C22-U100 no dark picture: the light one still goes, with dark null', async () => {
    const user = userEvent.setup();
    const { mod } = fakeModule();
    (mod.exportToCanvas as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('out of memory'));
    const p = props({ load: async () => mod });
    render(<DrawingSheet {...p} />);
    await screen.findByTestId('excalidraw');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalledTimes(1));
    const out = (p.onDone as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      pictures: { light: Blob; dark: Blob | null };
    };
    expect(await out.pictures.light.text()).toBe('light');
    expect(out.pictures.dark).toBeNull();
  });

  it('C22-U100 no light picture: no pictures at all, as before', async () => {
    const user = userEvent.setup();
    const { mod } = fakeModule();
    (mod.exportToBlob as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no'));
    const p = props({ load: async () => mod });
    render(<DrawingSheet {...p} />);
    await screen.findByTestId('excalidraw');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(p.onDone).toHaveBeenCalledWith({ empty: false, pictures: null }));
  });
});
