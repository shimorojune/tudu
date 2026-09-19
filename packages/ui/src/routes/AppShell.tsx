import { RequireAuth } from "@/routes/RequireAuth";
import { RootLayout } from "@/routes/RootLayout";
import { NotificationHost, SyncHost } from "@/providers/AppProviders";
import { ClientVersionReporter } from "@/components/chrome/ClientVersionReporter";

export function AppShell() {
  return (
    <RequireAuth>
      <SyncHost />
      <ClientVersionReporter />
      <NotificationHost />
      <RootLayout />
    </RequireAuth>
  );
}
