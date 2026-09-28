import { Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useGetMeQuery } from "@tudu/store";
import { BrandMark } from "@/components/chrome/BrandMark";
import { authClient } from "@/lib/authClient";

type RequireAuthProps = {
  children?: ReactNode;
};

export function RequireAuth({ children }: RequireAuthProps) {
  const { data: session, isPending } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me, isLoading: meLoading } = useGetMeQuery(undefined, {
    skip: !session,
  });

  if (isPending || (session && meLoading)) {
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

  if (
    me &&
    me.onboardedAt === null &&
    pathname !== "/welcome" &&
    !pathname.startsWith("/invite/") &&
    !pathname.startsWith("/join")
  ) {
    return <Navigate to="/welcome" search={{ orgSlug: undefined }} />;
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
}
