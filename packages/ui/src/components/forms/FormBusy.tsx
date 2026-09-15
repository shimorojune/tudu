import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FormBusyProps = {
  busy: boolean;
  children: ReactNode;
  className?: string;
};

export function FormBusy({ busy, children, className }: FormBusyProps) {
  return (
    <fieldset
      disabled={busy}
      className={cn("m-0 min-w-0 border-0 p-0 disabled:opacity-60", className)}
    >
      {children}
    </fieldset>
  );
}
