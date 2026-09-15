import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingStatus({
  children,
  className,
  "aria-label": ariaLabel = "Loading",
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      className={cn("h-full min-h-0", className)}
    >
      {children}
    </div>
  );
}
