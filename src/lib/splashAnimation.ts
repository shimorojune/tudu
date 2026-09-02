import { TUDU_T_PATH } from "@/components/TuduLogo";

export const SPLASH_DURATION_MS = 2850;
export const SPLASH_FADE_MS = 350;

// A: red T in           0.00 - 0.40
// B: red stripes in T   0.40 - 0.85
// C: zoom outward       0.85 - 1.35
// D: multicolor spread  1.35 - 2.10
// E: compress + dim     2.10 - 2.45
// F: wordmark           2.45

const PHASE_A_END = 0.4;
const PHASE_B_END = 0.85;
const PHASE_C_END = 1.35;
const PHASE_D_END = 2.1;
const PHASE_E_END = 2.45;
const BAR_COUNT = 64;

const NETFLIX_RED: [number, number, number] = [229, 9, 20];

const WARM_PALETTE: [number, number, number][] = [
  [229, 9, 20],
  [255, 40, 20],
  [255, 75, 31],
  [255, 110, 20],
  [255, 138, 0],
  [255, 170, 30],
  [255, 195, 0],
];

const FULL_PALETTE: [number, number, number][] = [
  [229, 9, 20],
  [255, 75, 31],
  [255, 138, 0],
  [255, 195, 0],
  [245, 245, 245],
  [194, 24, 91],
  [123, 47, 247],
  [21, 101, 255],
  [0, 194, 255],
];

interface Bar {
  slot: number;
  widthFrac: number;
  warm: [number, number, number];
  full: [number, number, number];
  depth: number;
  bright: number;
}

export interface SplashCallbacks {
  onWordmark?: () => void;
  onComplete: () => void;
}

export interface SplashOptions {
  reducedMotion?: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function pickWarmColor(t: number): [number, number, number] {
  const idx = Math.floor(seededRandom(t * 53) * WARM_PALETTE.length);
  return WARM_PALETTE[idx] ?? NETFLIX_RED;
}

function pickFullColor(t: number): [number, number, number] {
  const dist = Math.abs(t - 0.5) * 2;
  if (dist < 0.3) {
    return FULL_PALETTE[Math.floor(seededRandom(t * 97) * 4)] ?? NETFLIX_RED;
  }
  if (dist < 0.65) {
    return FULL_PALETTE[4 + Math.floor(seededRandom(t * 131) * 2)] ?? FULL_PALETTE[5]!;
  }
  return FULL_PALETTE[6 + Math.floor(seededRandom(t * 173) * 3)] ?? FULL_PALETTE[8]!;
}

function createBars(count: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.5) / count;
    bars.push({
      slot,
      widthFrac: 0.25 + seededRandom(i + 1) * 0.45,
      warm: pickWarmColor(slot),
      full: pickFullColor(slot),
      depth: 0.6 + seededRandom(i + 2) * 0.8,
      bright: 0.7 + seededRandom(i + 3) * 0.3,
    });
  }
  return bars;
}

function getPhase(t: number): "A" | "B" | "C" | "D" | "E" | "F" {
  if (t < PHASE_A_END) return "A";
  if (t < PHASE_B_END) return "B";
  if (t < PHASE_C_END) return "C";
  if (t < PHASE_D_END) return "D";
  if (t < PHASE_E_END) return "E";
  return "F";
}

function phaseProgress(t: number, start: number, end: number): number {
  return clamp((t - start) / (end - start), 0, 1);
}

function tBounds(scale: number, cx: number, cy: number) {
  const left = cx - 14 * scale;
  const right = cx + 14 * scale;
  const top = cy - 16 * scale;
  const bottom = cy + 16 * scale;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function applyTClip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  dpr: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-32, -32);
  ctx.clip(new Path2D(TUDU_T_PATH));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function applyRectClip(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
}

function drawSolidT(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = `rgb(${NETFLIX_RED.join(",")})`;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-32, -32);
  ctx.fill(new Path2D(TUDU_T_PATH));
  ctx.restore();
}

function slotX(slot: number, left: number, right: number): number {
  return lerp(left, right, slot);
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
  alpha: number,
  glow = false,
) {
  const w = Math.max(width, 0.5);
  const [r, g, b] = color;
  const a = clamp(alpha, 0, 1);

  const grad = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
  grad.addColorStop(0.15, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(0.85, `rgba(${r},${g},${b},${a})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

  ctx.fillStyle = grad;
  ctx.fillRect(x - w / 2, y, w, height);

  if (glow && w > 2) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = a * 0.25;
    const coreW = Math.max(w * 0.15, 1);
    const core = ctx.createLinearGradient(x - coreW / 2, 0, x + coreW / 2, 0);
    core.addColorStop(0, "rgba(255,255,255,0)");
    core.addColorStop(0.5, "rgba(255,255,255,0.6)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(x - coreW / 2, y, coreW, height);
    ctx.restore();
  }
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function drawBarsInBounds(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  bounds: { left: number; right: number; top: number; height: number },
  colorFn: (bar: Bar) => [number, number, number],
  alphaFn: (bar: Bar) => number,
  xFn: (bar: Bar, xSlot: number) => number,
  widthFn: (bar: Bar) => number,
  barHeight: number,
  glow = false,
) {
  for (const bar of bars) {
    const xSlot = slotX(bar.slot, bounds.left, bounds.right);
    const x = xFn(bar, xSlot);
    const w = widthFn(bar);
    const color = colorFn(bar);
    const alpha = alphaFn(bar);
    drawBar(ctx, x, bounds.top, w, barHeight, color, alpha * bar.bright, glow);
  }
}

function clearFrame(ctx: CanvasRenderingContext2D, width: number, height: number, trail = false) {
  if (trail) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
  }
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  bars: Bar[],
  dpr: number,
) {
  const t = elapsed / 1000;
  const phase = getPhase(t);
  const cx = width / 2;
  const cy = height / 2;
  const baseScale = Math.min(width, height) * 0.011;
  const bounds = tBounds(baseScale, cx, cy);
  const slotWidth = bounds.width / BAR_COUNT;

  if (phase === "A") {
    const p = easeOutCubic(phaseProgress(t, 0, PHASE_A_END));
    clearFrame(ctx, width, height);
    const scale = lerp(0.8, 1, p);
    drawSolidT(ctx, cx, cy, baseScale * scale, p);
    return;
  }

  if (phase === "B") {
    const p = easeInOutCubic(phaseProgress(t, PHASE_A_END, PHASE_B_END));
    clearFrame(ctx, width, height);

    const stripeMix = easeInCubic(p);
    const solidAlpha = 1 - stripeMix;

    if (solidAlpha > 0.02) {
      drawSolidT(ctx, cx, cy, baseScale, solidAlpha);
    }

    if (stripeMix > 0.02) {
      applyTClip(ctx, cx, cy, baseScale, dpr);
      drawBarsInBounds(
        ctx,
        bars,
        bounds,
        (bar) => bar.warm,
        () => stripeMix * 0.95,
        (_bar, xSlot) => xSlot,
        (bar) => slotWidth * bar.widthFrac,
        bounds.height * 1.05,
        false,
      );
      ctx.restore();
    }
    return;
  }

  if (phase === "C") {
    const p = easeInOutCubic(phaseProgress(t, PHASE_B_END, PHASE_C_END));
    clearFrame(ctx, width, height, p > 0.1);

    const zoom = lerp(1, 3.5, easeInCubic(p));
    const clipRelease = clamp(p / 0.3, 0, 1);
    const barHeight = lerp(bounds.height * 1.1, height * 3, easeInCubic(p));
    const y = cy - barHeight / 2;

    if (clipRelease < 0.99) {
      const clipLeft = lerp(bounds.left, 0, clipRelease);
      const clipTop = lerp(bounds.top, 0, clipRelease);
      const clipW = lerp(bounds.width, width, clipRelease);
      const clipH = lerp(bounds.height, height, clipRelease);
      applyRectClip(ctx, clipLeft, clipTop, clipW, clipH);
    }

    for (const bar of bars) {
      const xSlot = slotX(bar.slot, bounds.left, bounds.right);
      const x = cx + (xSlot - cx) * zoom * bar.depth;
      const w = slotWidth * bar.widthFrac * zoom;
      drawBar(ctx, x, y, w, barHeight, bar.warm, 0.92 * bar.bright, p > 0.3);
    }

    if (clipRelease < 0.99) {
      ctx.restore();
    }
    return;
  }

  if (phase === "D") {
    const p = easeInOutCubic(phaseProgress(t, PHASE_C_END, PHASE_D_END));
    clearFrame(ctx, width, height, true);

    const zoom = lerp(3.5, 1, easeOutCubic(p));
    const colorPhase = p;
    const barHeight = height * 2.8;
    const y = cy - barHeight / 2;
    const fullLeft = width * 0.02;
    const fullRight = width * 0.98;
    const fullSlotW = (fullRight - fullLeft) / BAR_COUNT;

    for (const bar of bars) {
      const xFull = slotX(bar.slot, fullLeft, fullRight);
      const xT = slotX(bar.slot, bounds.left, bounds.right);
      const xZoomed = cx + (xT - cx) * zoom * bar.depth;
      const x = lerp(xZoomed, xFull, easeOutCubic(p));

      const wZoomed = slotWidth * bar.widthFrac * zoom;
      const wFull = fullSlotW * bar.widthFrac;
      const w = lerp(wZoomed, wFull, easeOutCubic(p));

      const warmToFull = lerpColor(bar.warm, bar.full, easeOutCubic(p));
      const coolBias = colorPhase > 0.5
        ? lerpColor(warmToFull, bar.full, (colorPhase - 0.5) * 2)
        : warmToFull;

      drawBar(ctx, x, y, w, barHeight, coolBias, 0.9 * bar.bright, true);
    }
    return;
  }

  if (phase === "E") {
    const p = easeInOutCubic(phaseProgress(t, PHASE_D_END, PHASE_E_END));
    clearFrame(ctx, width, height, p < 0.5);

    const collapse = 1 - p;
    const barHeight = height * 2.5 * collapse;
    const y = cy - barHeight / 2;
    const fullLeft = width * 0.02;
    const fullRight = width * 0.98;
    const fullSlotW = (fullRight - fullLeft) / BAR_COUNT;

    if (collapse > 0.05) {
      for (const bar of bars) {
        const xFull = slotX(bar.slot, fullLeft, fullRight);
        const x = lerp(xFull, cx, p * 0.7);
        const w = fullSlotW * bar.widthFrac * collapse;
        drawBar(ctx, x, y, w, barHeight, bar.full, 0.8 * collapse * bar.bright, false);
      }
    }

    ctx.fillStyle = `rgba(0, 0, 0, ${easeInCubic(p) * 0.9})`;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  clearFrame(ctx, width, height);
}

export function runSplash(
  canvas: HTMLCanvasElement,
  callbacks: SplashCallbacks,
  options: SplashOptions = {},
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    callbacks.onComplete();
    return () => undefined;
  }

  const context = ctx;

  let rafId = 0;
  let skipped = false;
  let wordmarkShown = false;
  let startTime: number | null = null;
  const bars = createBars(BAR_COUNT);
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const { clientWidth, clientHeight } = canvas;
    canvas.width = Math.floor(clientWidth * dpr);
    canvas.height = Math.floor(clientHeight * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function showWordmark() {
    if (!wordmarkShown) {
      wordmarkShown = true;
      callbacks.onWordmark?.();
    }
  }

  function finish() {
    window.cancelAnimationFrame(rafId);
    callbacks.onComplete();
  }

  function frame(now: number) {
    if (skipped) return;

    if (startTime === null) {
      startTime = now;
    }

    const elapsed = now - startTime;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (options.reducedMotion) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, width, height);
      showWordmark();
      return;
    }

    renderFrame(context, width, height, elapsed, bars, dpr);

    const t = elapsed / 1000;
    if (t >= PHASE_E_END) {
      showWordmark();
    }

    if (elapsed >= SPLASH_DURATION_MS) {
      finish();
      return;
    }

    rafId = window.requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", resize);

  if (options.reducedMotion) {
    showWordmark();
    const reducedTimer = window.setTimeout(finish, 500);
    return () => {
      window.clearTimeout(reducedTimer);
      window.removeEventListener("resize", resize);
    };
  }

  rafId = window.requestAnimationFrame(frame);

  return () => {
    skipped = true;
    window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
  };
}

export function skipSplash(cleanup: () => void, onFadeComplete: () => void) {
  cleanup();
  window.setTimeout(onFadeComplete, 250);
}

// Debug helpers for frame-stepping verification in devtools
export function renderSplashAtTime(
  canvas: HTMLCanvasElement,
  targetMs: number,
  size?: { width: number; height: number },
): { width: number; height: number; phase: string } {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: 0, height: 0, phase: "none" };

  const width = size?.width ?? canvas.clientWidth;
  const height = size?.height ?? canvas.clientHeight;
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0, phase: "none" };
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bars = createBars(BAR_COUNT);
  renderFrame(ctx, width, height, targetMs, bars, dpr);

  return {
    width,
    height,
    phase: getPhase(targetMs / 1000),
  };
}

export function analyzeSplashFrame(
  canvas: HTMLCanvasElement,
): {
  whiteRatio: number;
  bandCount: number;
  stemBright: number;
  outsideDark: number;
} {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { whiteRatio: 1, bandCount: 0, stemBright: 0, outsideDark: 0 };
  }

  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) {
    return { whiteRatio: 1, bandCount: 0, stemBright: 0, outsideDark: 0 };
  }

  const data = ctx.getImageData(0, 0, w, h).data;
  const logicalW = canvas.clientWidth || w;
  const logicalH = canvas.clientHeight || h;
  const dpr = w / logicalW;
  const cy = Math.floor((logicalH / 2) * dpr);

  let white = 0;
  let total = 0;
  let transitions = 0;
  let prevBright = false;

  for (let x = 0; x < w; x++) {
    const i = (cy * w + x) * 4;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const bright = r > 60 || g > 60 || b > 60;
    if (r > 240 && g > 240 && b > 240) white++;
    total++;
    if (x > 0 && bright !== prevBright) transitions++;
    prevBright = bright;
  }

  const cx = Math.floor((logicalW / 2) * dpr);
  const stemI = (cy * w + cx) * 4;
  const stemBright = ((data[stemI] ?? 0) + (data[stemI + 1] ?? 0) + (data[stemI + 2] ?? 0)) / 3;

  const outsideX = Math.floor(w * 0.15);
  const outsideI = (cy * w + outsideX) * 4;
  const outsideBright = ((data[outsideI] ?? 0) + (data[outsideI + 1] ?? 0) + (data[outsideI + 2] ?? 0)) / 3;

  return {
    whiteRatio: white / total,
    bandCount: transitions,
    stemBright,
    outsideDark: 255 - outsideBright,
  };
}
