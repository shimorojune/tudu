import { useEffect, useRef } from "react";

/** Tracks the latest pointer Y in viewport coordinates during drags. */
export function usePointerY() {
  const pointerYRef = useRef<number | null>(null);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      pointerYRef.current = event.clientY;
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return pointerYRef;
}
