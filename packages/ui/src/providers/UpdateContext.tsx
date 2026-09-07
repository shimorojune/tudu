import { createContext, useContext, type ReactNode } from "react";

export type UpdatePhase = "hidden" | "available" | "downloading" | "ready";

export type UpdateContextValue = {
  phase: UpdatePhase;
  version?: string;
  releaseUrl?: string;
  notes?: string;
  progress?: number;
  dismiss: () => void;
  install: () => void;
  restart: () => void;
  openRelease?: () => void;
};

export const defaultUpdateContextValue: UpdateContextValue = {
  phase: "hidden",
  dismiss: () => {},
  install: () => {},
  restart: () => {},
};

export const UpdateContext = createContext<UpdateContextValue>(
  defaultUpdateContextValue,
);

export function useUpdate() {
  return useContext(UpdateContext);
}

type UpdateProviderProps = {
  value: UpdateContextValue;
  children: ReactNode;
};

export function UpdateProvider({ value, children }: UpdateProviderProps) {
  return (
    <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
  );
}
