import { Outlet } from "@tanstack/react-router";
import { CommandPalette } from "@/components/chrome/CommandPalette";
import { CommandPaletteProvider } from "@/components/chrome/CommandPaletteContext";
import { BottomNav } from "@/components/chrome/BottomNav";
import { TopNav } from "@/components/chrome/TopNav";
import { UpdateBanner } from "@/components/chrome/UpdateBanner";
import { QuickAddMainSync } from "@/lib/quickAddMainSync";
export function RootLayout() {
  return (
    <CommandPaletteProvider>
      <QuickAddMainSync />
      <div className="flex h-dvh flex-col overflow-hidden bg-background">
        <TopNav />
        <CommandPalette />
        <UpdateBanner />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </CommandPaletteProvider>
  );
}
