import { cx } from '../lib/cx';
import { useControllable } from '../lib/hooks';
import { TickSvg } from '../lib/ink';
import type { ThemeChoice } from '../lib/theme';

export interface ThemePickProps {
  value?: ThemeChoice;
  defaultValue?: ThemeChoice;
  onChange?: (t: ThemeChoice) => void;
  /** Phones: three equal cards, no second line. */
  compact?: boolean;
  /** Under System: "Follows your computer". */
  systemNote?: string;
  label?: string;
  className?: string;
}

const L = ['#eeece6', '#fffdf8', '#18181b', '#dcd8cf'] as const;
const D = ['#111211', '#1d1c1a', '#f2efe8', '#3a3834'] as const;

/** A small picture of a sheet of tasks in one theme; System is split light and dark. */
function ThemeArt({ kind }: { kind: ThemeChoice }) {
  const sheet = (c: readonly string[], clip?: string) => {
    const [bg, card, ink, line] = c;
    return (
      <g clipPath={clip}>
        <rect x={0} y={0} width={140} height={88} fill={bg} />
        <rect x={22} y={14} width={96} height={74} rx={8} fill={card} />
        <path d="M34 32h10" stroke={ink} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
        {[42, 56, 70].map((y, i) => (
          <g key={y}>
            <rect
              x={34}
              y={y}
              width={7}
              height={7}
              rx={2}
              fill="none"
              stroke={ink}
              strokeWidth={1.4}
              opacity={0.55}
            />
            <path
              d={`M47 ${y + 3.5}h${[44, 34, 40][i]}`}
              stroke={line}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </g>
        ))}
      </g>
    );
  };
  const id = `tp-ta-${kind}`;
  return (
    <svg
      viewBox="0 0 140 88"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {kind === 'system' ? (
        <defs>
          <clipPath id={`${id}a`}>
            <path d="M0 0h84L56 88H0z" />
          </clipPath>
          <clipPath id={`${id}b`}>
            <path d="M84 0h56v88H56z" />
          </clipPath>
        </defs>
      ) : null}
      {kind === 'dark' ? (
        sheet(D)
      ) : kind === 'light' ? (
        sheet(L)
      ) : (
        <>
          {sheet(L, `url(#${id}a)`)}
          {sheet(D, `url(#${id}b)`)}
        </>
      )}
    </svg>
  );
}

/** Light, Dark or System as three picture cards; the picked one takes an ink ring and a tick. */
export function ThemePick({
  value,
  defaultValue = 'system',
  onChange,
  compact,
  systemNote = 'Follows your computer',
  label = 'Theme',
  className,
}: ThemePickProps) {
  const [val, set] = useControllable(value, defaultValue);
  const opts: Array<{ v: ThemeChoice; l: string; s?: string }> = [
    { v: 'light', l: 'Light' },
    { v: 'dark', l: 'Dark' },
    { v: 'system', l: 'System', s: systemNote },
  ];
  return (
    <div
      className={cx('tp-root tp-theme', compact && 'tp-compact', className)}
      role="radiogroup"
      aria-label={label}
    >
      {opts.map((o) => {
        const on = val === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={on}
            className={cx('tp-theme-o', on && 'tp-on')}
            onClick={() => {
              if (on) return;
              set(o.v);
              onChange?.(o.v);
            }}
          >
            <span className="tp-theme-art">
              <ThemeArt kind={o.v} />
              <span className="tp-theme-ok" aria-hidden="true">
                <TickSvg size={12} />
              </span>
            </span>
            <span className="tp-theme-l">
              {o.l}
              {o.s ? <span>{o.s}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
