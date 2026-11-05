/**
 * The dark picture of a drawing, made by Tudu rather than by Excalidraw (#55).
 *
 * Excalidraw makes its dark export by setting `ctx.filter` on the export canvas. WebKit ignores `ctx.filter`, so in
 * the Mac app and in Safari its "dark" picture was a copy of the light one. Here the same flip is done on the pixels,
 * the same way on every browser. Full size, Excalidraw flips with a CSS filter, which WebKit does draw, so the two
 * look alike.
 */

/** Excalidraw's dark theme: the whole canvas goes through this. */
export const THEME_FILTER = 'invert(93%) hue-rotate(180deg)';
/** What Excalidraw puts an image through first in dark mode, so the theme's flip brings it back near its colours. */
export const IMAGE_FILTER = 'invert(100%) hue-rotate(180deg) saturate(1.25)';

type M3 = readonly [number, number, number, number, number, number, number, number, number];

/** Filter Effects' hue-rotate matrix. */
function hueRotate(deg: number): M3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];
}

/** Filter Effects' saturate matrix. */
function saturate(v: number): M3 {
  return [
    0.213 + 0.787 * v,
    0.715 - 0.715 * v,
    0.072 - 0.072 * v,
    0.213 - 0.213 * v,
    0.715 + 0.285 * v,
    0.072 - 0.072 * v,
    0.213 - 0.213 * v,
    0.715 - 0.715 * v,
    0.072 + 0.928 * v,
  ];
}

const HUE_180 = hueRotate(180);
const SAT_125 = saturate(1.25);

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** One matrix over r, g, b (0–255), clamped, as each function of a CSS filter list is. */
function apply(m: M3, r: number, g: number, b: number): [number, number, number] {
  return [
    clamp(m[0] * r + m[1] * g + m[2] * b),
    clamp(m[3] * r + m[4] * g + m[5] * b),
    clamp(m[6] * r + m[7] * g + m[8] * b),
  ];
}

/** `invert(amount)` on one channel (0–255). */
const invert = (amount: number, v: number) => clamp(amount * 255 + v * (1 - 2 * amount));

/** RGBA pixels (as `ImageData.data`) through {@link THEME_FILTER}, in place. Alpha is left alone. */
export function flipForDark(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = apply(
      HUE_180,
      invert(0.93, data[i]!),
      invert(0.93, data[i + 1]!),
      invert(0.93, data[i + 2]!),
    );
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}

/** RGBA pixels through {@link IMAGE_FILTER}, in place: an image, ready for the theme's flip. */
export function preflipImage(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [hr, hg, hb] = apply(HUE_180, 255 - data[i]!, 255 - data[i + 1]!, 255 - data[i + 2]!);
    const [r, g, b] = apply(SAT_125, hr, hg, hb);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}

/** An image file of a drawing, as Excalidraw keeps it. */
export interface DrawingFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

/** What `darkPicture` needs of Excalidraw. */
export interface CanvasExporter {
  exportToCanvas: (opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image didn’t load.'));
    img.src = src;
  });
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D canvas here.');
  return ctx;
}

/** One image put through {@link IMAGE_FILTER}. SVG is left alone, as Excalidraw leaves it. */
export async function preflipFile(f: DrawingFile): Promise<DrawingFile> {
  if (f.mimeType === 'image/svg+xml') return f;
  const img = await loadImage(f.dataURL);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = context(canvas);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  preflipImage(px.data);
  ctx.putImageData(px, 0, 0);
  return { ...f, mimeType: 'image/png', dataURL: canvas.toDataURL('image/png') };
}

/**
 * The drawing's dark picture: Excalidraw draws it light, with its images pre-flipped, then every pixel goes through
 * the theme's flip. The same on every browser.
 */
export async function darkPicture(
  m: CanvasExporter,
  opts: {
    elements: readonly unknown[];
    files: Record<string, DrawingFile>;
    exportPadding: number;
    getDimensions: (w: number, h: number) => { width: number; height: number; scale: number };
  },
): Promise<Blob> {
  const files: Record<string, DrawingFile> = {};
  await Promise.all(
    Object.entries(opts.files).map(async ([id, f]) => {
      files[id] = await preflipFile(f);
    }),
  );
  const canvas = await m.exportToCanvas({
    elements: opts.elements,
    files,
    exportPadding: opts.exportPadding,
    getDimensions: opts.getDimensions,
    appState: { exportBackground: false, exportWithDarkMode: false, viewBackgroundColor: 'transparent' },
  });
  const ctx = context(canvas);
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  flipForDark(px.data);
  ctx.putImageData(px, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No dark picture.'))), 'image/png'),
  );
}
