import { Outlet } from "@tanstack/react-router";
import { CommandPalette } from "@/components/chrome/CommandPalette";
import { CommandPaletteProvider } from "@/components/chrome/CommandPaletteContext";
import { TopNav } from "@/components/chrome/TopNav";
import { UpdateBanner } from "@/components/chrome/UpdateBanner";

export function RootLayout() {
  return (
    <CommandPaletteProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <TopNav />
        <CommandPalette />
        <UpdateBanner />
        <main className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </CommandPaletteProvider>
  );
}
