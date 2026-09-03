import markLightUrl from "@assets/tudu-mark.svg?url";
import markDarkUrl from "@assets/tudu-mark-reverse.svg?url";
import lockupUrl from "@assets/tudu-lockup.svg?url";
import { cn } from "@/lib/utils";

interface TuduLogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  /** Use reverse mark on dark grounds (default: auto from `.dark` on `<html>`). */
  onDark?: boolean;
  className?: string;
}

const iconHeights = {
  sm: 28,
  md: 40,
  lg: 72,
};

const textSizes = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-5xl",
};

function resolveDarkGround(explicit?: boolean) {
  return explicit ?? true;
}

export function TuduLogo({
  size = "sm",
  showText = false,
  onDark,
  className,
}: TuduLogoProps) {
  const height = iconHeights[size];
  const darkGround = resolveDarkGround(onDark);

  if (showText && !darkGround) {
    return (
      <img
        src={lockupUrl}
        alt="Tudu"
        height={height}
        className={cn("w-auto shrink-0", className)}
        style={{ height }}
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={darkGround ? markDarkUrl : markLightUrl}
        alt=""
        aria-hidden="true"
        height={height}
        className="w-auto shrink-0"
        style={{ height }}
      />
      {showText && (
        <span
          className={cn(
            "font-extrabold tracking-tight text-foreground",
            textSizes[size],
          )}
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Tudu
        </span>
      )}
    </div>
  );
}

export function TuduMark({
  className,
  onDark,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const darkGround = resolveDarkGround(onDark);

  return (
    <img
      src={darkGround ? markDarkUrl : markLightUrl}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0", className)}
    />
  );
}
