import { cn } from "@/lib/utils";

export const TUDU_T_PATH = "M18 20h28v8H34v24h-8V28H18v-8z";

interface TuduLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const iconSizes = {
  sm: 28,
  md: 40,
  lg: 72,
};

const textSizes = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-5xl",
};

export function TuduLogo({ size = "sm", showText = false, className }: TuduLogoProps) {
  const iconSize = iconSizes[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="64" height="64" rx="14" className="fill-primary" />
        <path
          d={TUDU_T_PATH}
          className="fill-primary-foreground"
        />
        <path
          d="M20 22h24v4H20v-4z"
          fill="white"
          fillOpacity="0.15"
        />
      </svg>
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight text-foreground",
            textSizes[size],
          )}
        >
          Tudu
        </span>
      )}
    </div>
  );
}

export function TuduMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path
        d={TUDU_T_PATH}
        className="fill-primary-foreground"
      />
    </svg>
  );
}
