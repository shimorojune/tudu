import { RequireAuth } from "@/routes/RequireAuth";
import { RootLayout } from "@/routes/RootLayout";

export function AppShell() {
  return (
    <RequireAuth>
      <RootLayout />
    </RequireAuth>
  );
}
