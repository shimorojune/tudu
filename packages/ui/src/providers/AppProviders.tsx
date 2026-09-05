import { setAuthTokenGetter, store } from "@tudu/store";
import { useEffect, type ReactNode } from "react";
import { Provider } from "react-redux";
import { getStoredAuthToken } from "@/lib/authClient";
import { ThemeProvider } from "./ThemeProvider";

function AuthTokenBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthTokenGetter(getStoredAuthToken);
  }, []);

  return <>{children}</>;
}

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <AuthTokenBridge>{children}</AuthTokenBridge>
      </ThemeProvider>
    </Provider>
  );
}
