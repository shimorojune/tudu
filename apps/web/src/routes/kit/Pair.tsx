import { Desk, type Theme } from '@tudu/ui';
import type { ReactNode } from 'react';

/** One component, shown in light and dark side by side. `render` is called once per theme so each has its own state. */
export function Pair({
  render,
  title,
  note,
  id,
}: {
  render: (theme: Theme) => ReactNode;
  title: string;
  note?: string;
  id?: string;
}) {
  return (
    <section className="kit-block" id={id} aria-label={title}>
      <h3 className="kit-h3">{title}</h3>
      {note ? <p className="kit-note">{note}</p> : null}
      <div className="kit-pair">
        {(['light', 'dark'] as const).map((theme) => (
          <Desk key={theme} theme={theme} page={false} className="kit-desk" data-kit-theme={theme}>
            <div className="kit-desk-in">{render(theme)}</div>
          </Desk>
        ))}
      </div>
    </section>
  );
}

export function Row({
  children,
  gap = 12,
  wrap = true,
  align = 'center',
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
  align?: 'center' | 'flex-start' | 'stretch';
}) {
  return (
    <div style={{ display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap, alignItems: align }}>
      {children}
    </div>
  );
}

export function Col({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'flex-start' }}>{children}</div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <span className="kit-label">{children}</span>;
}

export function Section({
  title,
  id,
  children,
  lead,
}: {
  title: string;
  id: string;
  children: ReactNode;
  lead?: string;
}) {
  return (
    <section className="kit-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 className="kit-h2" id={`${id}-h`}>
        {title}
      </h2>
      {lead ? <p className="kit-lead">{lead}</p> : null}
      {children}
    </section>
  );
}
