import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import type { Theme } from '../lib/theme';

export interface DeskProps {
  theme?: Theme;
  children?: ReactNode;
  /** Keeps the scrollbar's space so the page never shifts sideways. On by default. */
  gutter?: boolean;
  /** As a page (default) the Desk is one window tall and is the scrolling area; it also paints the window. */
  page?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The page surface behind the sheets, in light or dark. The app's root is painted by paper-theme.css already;
 * use a Desk to show a theme in place (the kit page, previews) or as the root of a prototype page.
 */
export function Desk({ theme = 'light', children, gutter = true, page = true, className, style }: DeskProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !page || typeof document === 'undefined') return;
    const root = document.documentElement;
    const prevBg = root.style.backgroundColor;
    const prevScheme = root.style.colorScheme;
    root.setAttribute('data-tp-desk', theme);
    root.style.backgroundColor = getComputedStyle(el).backgroundColor;
    root.style.colorScheme = theme;
    return () => {
      root.removeAttribute('data-tp-desk');
      root.style.backgroundColor = prevBg;
      root.style.colorScheme = prevScheme;
    };
  }, [theme, page]);
  return (
    <div
      ref={ref}
      className={cx(
        'tp-root tp-desk',
        theme,
        page && 'tp-desk-page',
        page && gutter && 'tp-gutter',
        className,
      )}
      data-theme={theme}
      style={style}
    >
      {children}
    </div>
  );
}
