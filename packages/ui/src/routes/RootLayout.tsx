import { Outlet } from "@tanstack/react-router";
import { TopNav } from "@/components/chrome/TopNav";
import { UpdateBanner } from "@/components/chrome/UpdateBanner";

export function RootLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopNav />
      <UpdateBanner />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
