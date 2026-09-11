export type ViewportBand = "phone" | "tablet" | "desktop";

export const MD_MIN_WIDTH = 768;
export const XL_MIN_WIDTH = 1280;

export function viewportBandFromWidth(width: number): ViewportBand {
  if (width < MD_MIN_WIDTH) {
    return "phone";
  }
  if (width < XL_MIN_WIDTH) {
    return "tablet";
  }
  return "desktop";
}

export function readViewportBand(): ViewportBand {
  if (typeof window === "undefined") {
    return "desktop";
  }
  return viewportBandFromWidth(window.innerWidth);
}
