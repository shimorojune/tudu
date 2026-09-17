import {
  setAuthTokenGetter,
  startSync,
  stopSync,
  store,
  useGetMeQuery,
  type AppDispatch,
} from "@tudu/store";
import { useEffect, type ReactNode } from "react";
import { Provider, useDispatch } from "react-redux";
import { getStoredAuthToken } from "@/lib/authClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  NotificationOsProvider,
  defaultNotificationOsValue,
} from "@/providers/NotificationOsContext";
import {
  UpdateContext,
  defaultUpdateContextValue,
} from "@/providers/UpdateContext";
import { AnalyticsProvider } from "@/providers/AnalyticsProvider";
import { ThemeProvider } from "./ThemeProvider";

function AuthTokenBridge({ children }: { children: ReactNode }) {
  setAuthTokenGetter(getStoredAuthToken);

  return <>{children}</>;
}

export function SyncHost() {
  const dispatch = useDispatch<AppDispatch>();
  const { data: me, isSuccess } = useGetMeQuery();

  useEffect(() => {
    if (!isSuccess || !me?.id) {
      return;
    }
    dispatch(startSync(me.id));
    return () => {
      dispatch(stopSync());
    };
  }, [dispatch, isSuccess, me?.id]);

  return null;
}

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <Provider store={store}>
      <AnalyticsProvider>
        <UpdateContext.Provider value={defaultUpdateContextValue}>
          <NotificationOsProvider value={defaultNotificationOsValue}>
            <ThemeProvider>
              <TooltipProvider delayDuration={150}>
                <AuthTokenBridge>{children}</AuthTokenBridge>
              </TooltipProvider>
            </ThemeProvider>
          </NotificationOsProvider>
        </UpdateContext.Provider>
      </AnalyticsProvider>
    </Provider>
  );
}
