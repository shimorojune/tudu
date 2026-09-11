import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LoadingStatus({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={cn("h-full min-h-0", className)}
    >
      {children}
    </div>
  );
}
