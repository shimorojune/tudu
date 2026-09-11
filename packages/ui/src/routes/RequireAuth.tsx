import { Navigate, Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/chrome/BrandMark";
import { authClient } from "@/lib/authClient";

type RequireAuthProps = {
  children?: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background pt-[env(safe-area-inset-top)]">
        <BrandMark />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/sign-in" />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
