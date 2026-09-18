import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AnalyticsErrorBoundary } from "@/providers/AnalyticsErrorBoundary";
import { router } from "@/router";

export default function App() {
  return (
    <AnalyticsErrorBoundary>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </AnalyticsErrorBoundary>
  );
}
