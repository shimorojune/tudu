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
  UpdateContext,
  defaultUpdateContextValue,
} from "@/providers/UpdateContext";
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
      <UpdateContext.Provider value={defaultUpdateContextValue}>
        <ThemeProvider>
          <TooltipProvider delayDuration={150}>
            <AuthTokenBridge>{children}</AuthTokenBridge>
          </TooltipProvider>
        </ThemeProvider>
      </UpdateContext.Provider>
    </Provider>
  );
}
