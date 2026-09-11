import { RequireAuth } from "@/routes/RequireAuth";
import { RootLayout } from "@/routes/RootLayout";
import { SyncHost } from "@/providers/AppProviders";
import { NotificationHost } from "@/providers/NotificationHost";

export function AppShell() {
  return (
    <RequireAuth>
      <SyncHost />
      <NotificationHost />
      <RootLayout />
    </RequireAuth>
  );
}
