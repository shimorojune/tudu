import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { setAuthTokenGetter, store } from "@tudu/store";
import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";

function AuthTokenBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    setAuthTokenGetter(() => getToken());
  }, [getToken, isLoaded]);

  return <>{children}</>;
}

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <Provider store={store}>
        <AuthTokenBridge>{children}</AuthTokenBridge>
      </Provider>
    </ClerkProvider>
  );
}
