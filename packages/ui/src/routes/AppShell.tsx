import { RequireAuth } from "@/routes/RequireAuth";
import { RootLayout } from "@/routes/RootLayout";
import { SyncHost } from "@/providers/AppProviders";

export function AppShell() {
  return (
    <RequireAuth>
      <SyncHost />
      <RootLayout />
    </RequireAuth>
  );
}
