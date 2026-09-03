import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@tudu/ui";
import "@tudu/ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
