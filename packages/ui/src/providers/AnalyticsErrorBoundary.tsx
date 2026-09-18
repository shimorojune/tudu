import { Component, type ErrorInfo, type ReactNode } from "react";
import { capture } from "@/lib/analytics/posthog";

type AnalyticsErrorBoundaryProps = {
  children: ReactNode;
};

type AnalyticsErrorBoundaryState = {
  hasError: boolean;
};

export class AnalyticsErrorBoundary extends Component<
  AnalyticsErrorBoundaryProps,
  AnalyticsErrorBoundaryState
> {
  state: AnalyticsErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AnalyticsErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    capture("$exception", {
      origin: "client",
      $exception_message: error.message,
      $exception_type: error.name,
      component_stack: info.componentStack ?? "",
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Try reloading the page. If it keeps happening, use Settings or
            contact support.
          </p>
          <button
            type="button"
            className="border border-rule bg-card px-4 py-2 text-sm font-semibold"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
