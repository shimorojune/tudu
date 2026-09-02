import { cn } from "@/lib/utils";

interface WizardAvatarProps {
  alerting: boolean;
  className?: string;
}

export function WizardAvatar({ alerting, className }: WizardAvatarProps) {
  return (
    <div
      className={cn(
        "wizard-character",
        alerting ? "wizard-character--alert" : "wizard-character--idle",
        className,
      )}
      aria-hidden="true"
    >
      {alerting && (
        <div className="wizard-sparks">
          <span className="wizard-spark wizard-spark--1" />
          <span className="wizard-spark wizard-spark--2" />
          <span className="wizard-spark wizard-spark--3" />
          <span className="wizard-spark wizard-spark--4" />
        </div>
      )}

      <svg viewBox="0 0 80 96" className="wizard-svg" fill="none">
        {/* wand + hand */}
        <g className="wizard-wand-arm">
          <rect x="58" y="52" width="3" height="22" rx="1.5" fill="#5c4033" />
          <rect x="57" y="48" width="5" height="6" rx="1" fill="#8b6914" />
          <circle cx="59.5" cy="47" r="2.5" fill="#ffd54f" className="wizard-wand-tip" />
          <ellipse cx="52" cy="58" rx="5" ry="4" fill="#f5d0a9" />
        </g>

        {/* robes */}
        <path
          d="M18 72c2-8 8-14 22-14s20 6 22 14v24H18V72z"
          fill="#1a2744"
        />
        <path
          d="M28 58c4-2 10-3 16-3s12 1 16 3v14c-4 2-10 3-16 3s-12-1-16-3V58z"
          fill="#243352"
          className="wizard-robe-collar"
        />

        {/* head */}
        <circle cx="40" cy="38" r="14" fill="#f5d0a9" />

        {/* hair (messy dark) */}
        <path
          d="M26 34c2-10 10-16 14-16s12 6 14 16c-3-2-8-3-14-3s-11 1-14 3z"
          fill="#2a1810"
        />
        <path d="M28 30c1-4 6-8 12-8s11 4 12 8" stroke="#2a1810" strokeWidth="3" strokeLinecap="round" />

        {/* round glasses */}
        <circle cx="34" cy="38" r="5" stroke="#3d2914" strokeWidth="1.5" fill="none" />
        <circle cx="46" cy="38" r="5" stroke="#3d2914" strokeWidth="1.5" fill="none" />
        <path d="M39 38h2" stroke="#3d2914" strokeWidth="1.5" />

        {/* eyes behind glasses */}
        <circle cx="34" cy="38" r="2" fill="#1a1a2e" />
        <circle cx="46" cy="38" r="2" fill="#1a1a2e" />
        <circle cx="35" cy="37" r="0.8" fill="white" />
        <circle cx="47" cy="37" r="0.8" fill="white" />

        {/* small smile */}
        <path d="M36 44 Q40 47 44 44" stroke="#c4956a" strokeWidth="1.2" strokeLinecap="round" fill="none" />

        {/* scarf stripe */}
        <path d="M28 52h24v4c-4 2-8 2-12 0v-4z" fill="#7f1d1d" />
        <path d="M28 56h24v2H28z" fill="#b8860b" opacity="0.9" />

        {/* hat */}
        <g className="wizard-hat">
          <path d="M22 28 L40 4 L58 28 Z" fill="#1a2744" />
          <ellipse cx="40" cy="28" rx="20" ry="4" fill="#243352" />
          <path d="M34 18 L40 10 L46 18" stroke="#b8860b" strokeWidth="1.5" fill="none" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
}
