import { afterEach, describe, expect, it, vi } from 'vitest';
import { darkPicture, flipForDark, preflipImage, type DrawingFile } from './drawing-dark';

const px = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a]);
const rgb = (d: Uint8ClampedArray) => Array.from(d.slice(0, 3));

/** What Chrome draws for these colours with `ctx.filter` (sampled 5 Nov 2026, Chromium via Playwright). */
const CHROME_THEME: [number[], number[]][] = [
  [
    [30, 30, 30],
    [211, 211, 211],
  ],
  [
    [255, 255, 255],
    [17, 17, 17],
  ],
  [
    [224, 49, 49],
    [255, 131, 131],
  ],
  [
    [25, 113, 194],
    [85, 161, 230],
  ],
  [
    [47, 158, 68],
    [58, 153, 76],
  ],
  [
    [240, 140, 0],
    [183, 97, 0],
  ],
  [
    [128, 128, 128],
    [127, 127, 127],
  ],
];
const CHROME_IMAGE: [number[], number[]][] = [
  [
    [30, 30, 30],
    [225, 225, 225],
  ],
  [
    [224, 49, 49],
    [255, 125, 125],
  ],
  [
    [25, 113, 194],
    [61, 171, 255],
  ],
  [
    [230, 180, 150],
    [118, 55, 16],
  ],
];

function near(got: number[], want: number[], by: number) {
  got.forEach((v, i) => expect(Math.abs(v - want[i]!)).toBeLessThanOrEqual(by));
}

describe('C22-U97 the dark picture’s flip (#55)', () => {
  it('C22-U97 Excalidraw’s black ink comes out light, white comes out near Excalidraw’s dark', () => {
    const ink = rgb(flipForDark(px(0x1e, 0x1e, 0x1e)));
    ink.forEach((c) => expect(c).toBeGreaterThan(200));
    rgb(flipForDark(px(255, 255, 255))).forEach((c) => expect(c).toBeLessThan(0x20));
  });

  it('C22-U97 red stays red, only lighter', () => {
    const [r, g, b] = rgb(flipForDark(px(0xe0, 0x31, 0x31)));
    expect(r).toBeGreaterThan(g! + 80);
    expect(g).toBe(b);
    expect(g).toBeGreaterThan(0x31);
  });

  it('C22-U97 see-through pixels stay as they are; alpha never changes', () => {
    expect(Array.from(flipForDark(px(0, 0, 0, 0)))).toEqual([0, 0, 0, 0]);
    expect(flipForDark(px(30, 30, 30, 120))[3]).toBe(120);
  });

  it('C22-U97 matches Chrome’s ctx.filter within 3 per channel', () => {
    for (const [from, want] of CHROME_THEME)
      near(rgb(flipForDark(px(from[0]!, from[1]!, from[2]!))), want, 3);
    for (const [from, want] of CHROME_IMAGE)
      near(rgb(preflipImage(px(from[0]!, from[1]!, from[2]!))), want, 3);
  });
});

describe('C22-U98 an image in a drawing keeps its colours', () => {
  it('C22-U98 pre-flipped, then flipped with the theme, a photo comes back close to itself', () => {
    near(rgb(flipForDark(preflipImage(px(128, 128, 128)))), [128, 128, 128], 30);
    near(rgb(flipForDark(preflipImage(px(230, 180, 150)))), [230, 180, 150], 30);
  });
});

describe('C22-U99 images going into the dark picture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('C22-U99 a PNG is pre-flipped, an SVG is left alone', async () => {
    // An image that loads at once, one pixel big, and a canvas that holds one dark-grey pixel.
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        naturalWidth = 1;
        naturalHeight = 1;
        set src(_: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const make = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return make(tag);
      let data: Uint8ClampedArray = new Uint8ClampedArray([30, 30, 30, 255]);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data }),
          putImageData: (img: { data: Uint8ClampedArray }) => (data = img.data),
        }),
        toDataURL: () => `data:image/png;px=${Array.from(data).join(',')}`,
      };
    }) as typeof document.createElement);
    const files: Record<string, DrawingFile> = {
      p: { id: 'p', mimeType: 'image/jpeg', dataURL: 'data:image/jpeg;base64,AA==', created: 1 },
      s: { id: 's', mimeType: 'image/svg+xml', dataURL: 'data:image/svg+xml;base64,AA==', created: 1 },
    };
    const exportToCanvas = vi.fn(async () => ({
      width: 1,
      height: 1,
      getContext: () => ({
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => {},
      }),
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(['x'])),
    }));
    await darkPicture({ exportToCanvas } as never, {
      elements: [],
      files,
      exportPadding: 16,
      getDimensions: (w, h) => ({ width: w, height: h, scale: 1 }),
    });
    const sent = (exportToCanvas.mock.calls[0] as unknown as [{ files: Record<string, DrawingFile> }])[0]
      .files;
    expect(sent.s).toEqual(files.s);
    expect(sent.p!.mimeType).toBe('image/png');
    expect(sent.p!.dataURL).toBe('data:image/png;px=225,225,225,255');
  });
});
