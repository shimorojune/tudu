import { useEffect, useState } from "react";
import {
  MD_MIN_WIDTH,
  XL_MIN_WIDTH,
  readViewportBand,
  type ViewportBand,
} from "@/lib/viewport";

export function useViewportBand(): ViewportBand {
  const [band, setBand] = useState<ViewportBand>(readViewportBand);

  useEffect(() => {
    const mdQuery = window.matchMedia(`(min-width: ${MD_MIN_WIDTH}px)`);
    const xlQuery = window.matchMedia(`(min-width: ${XL_MIN_WIDTH}px)`);

    function sync() {
      setBand(readViewportBand());
    }

    mdQuery.addEventListener("change", sync);
    xlQuery.addEventListener("change", sync);
    sync();

    return () => {
      mdQuery.removeEventListener("change", sync);
      xlQuery.removeEventListener("change", sync);
    };
  }, []);

  return band;
}
