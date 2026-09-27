import { render, type RenderOptions } from "@testing-library/react";
import { Provider } from "react-redux";
import type { ReactElement, ReactNode } from "react";
import { makeStore, type AppDispatch } from "@tudu/store";

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  store?: ReturnType<typeof makeStore>;
};

export function renderWithProviders(
  ui: ReactElement,
  { store = makeStore(), ...renderOptions }: RenderWithProvidersOptions = {},
) {

  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return {
    store,
    dispatch: store.dispatch as AppDispatch,
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
