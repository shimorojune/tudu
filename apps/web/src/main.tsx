import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@tudu/ui";
import { AppProviders } from "@tudu/ui/providers";
import "@tudu/ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
