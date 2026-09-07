import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@tudu/ui";
import { AppProviders } from "@tudu/ui/providers";
import { DesktopUpdater } from "./DesktopUpdater";
import "@tudu/ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <DesktopUpdater>
        <App />
      </DesktopUpdater>
    </AppProviders>
  </StrictMode>,
);
