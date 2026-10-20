import { useEffect, useState } from 'react';

export type Viewport = 'phone' | 'tablet' | 'desktop';

/** Phones under 640px, tablets to 1023px, the desk from 1024px. */
export function viewportOf(width: number): Viewport {
  return width < 640 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() =>
    typeof window === 'undefined' ? 'desktop' : viewportOf(window.innerWidth),
  );
  useEffect(() => {
    const on = () => setVp(viewportOf(window.innerWidth));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}
