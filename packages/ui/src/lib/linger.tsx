import { useEffect, useState, type ReactNode } from 'react';
import { cx } from './cx';

/** How long a closed pop takes to ease out before it goes. */
export const POP_LEAVE_MS = 130;

/** A pop that eases out instead of vanishing: once closed it keeps its last content for a beat, then unmounts. */
export function Linger({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  // While open, the latest children are kept in state so they can stay on screen for the beat after it closes.
  const [kept, setKept] = useState<{ open: boolean; node: ReactNode; gone: boolean }>({
    open,
    node: children,
    gone: !open,
  });
  if (open && (kept.node !== children || !kept.open || kept.gone))
    setKept({ open: true, node: children, gone: false });
  if (!open && kept.open) setKept({ open: false, node: kept.node, gone: false });
  useEffect(() => {
    if (kept.open || kept.gone) return;
    const t = setTimeout(() => setKept((k) => (k.open ? k : { ...k, gone: true })), POP_LEAVE_MS);
    return () => clearTimeout(t);
  }, [kept]);
  if (kept.gone) return null;
  return <div className={cx(className, !kept.open && 'tp-pop-leaving')}>{kept.node}</div>;
}
