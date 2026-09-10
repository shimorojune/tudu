import { useLayoutEffect, useRef, type RefObject } from "react";

const SLIDE_MS = 180;
const SLIDE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function clearMotion(node: HTMLElement) {
  node.style.transition = "";
  node.style.transform = "";
}

/** FLIP slide when a row's position in the bucket order changes after a reorder preview. */
export function useSlideOnReorder(
  nodeRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  orderKey: string,
) {
  const previousTop = useRef<number | null>(null);
  const previousOrderKey = useRef<string | null>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) {
      previousTop.current = null;
      return;
    }

    if (!enabled || prefersReducedMotion()) {
      clearMotion(node);
      previousTop.current = node.offsetTop;
      previousOrderKey.current = null;
      return;
    }

    const element = node;
    const top = element.offsetTop;
    const previous = previousTop.current;
    const orderChanged = previousOrderKey.current !== orderKey;

    // Parent re-renders (inspector, timeline) must not cancel an in-flight FLIP.
    if (!orderChanged) {
      return;
    }

    previousTop.current = top;
    previousOrderKey.current = orderKey;

    // Expand and collapse moves rows too, but the panel's height transition
    // already animates that. A FLIP on top of it fights and then snaps.
    if (previous === null) {
      return;
    }

    const shift = previous - top;
    if (Math.abs(shift) < 1) {
      return;
    }

    element.style.transition = "none";
    element.style.transform = `translate3d(0, ${shift}px, 0)`;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        element.style.transition = `transform ${SLIDE_MS}ms ${SLIDE_EASING}`;
        element.style.transform = "translate3d(0, 0, 0)";
      });
    });

    function onEnd(event: TransitionEvent) {
      if (event.target !== element || event.propertyName !== "transform") {
        return;
      }
      clearMotion(element);
    }

    element.addEventListener("transitionend", onEnd);

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      element.removeEventListener("transitionend", onEnd);
    };
  }, [enabled, orderKey, nodeRef]);
}
