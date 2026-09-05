import { Outlet } from "@tanstack/react-router";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-[460px] px-4">
        <Outlet />
      </div>
    </div>
  );
}
