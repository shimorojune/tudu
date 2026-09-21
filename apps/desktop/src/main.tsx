import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@tudu/ui";
import { AttachmentDownloadProvider } from "@tudu/ui/attachments";
import { AppProviders } from "@tudu/ui/providers";
import { DesktopUpdater } from "./DesktopUpdater";
import { DesktopNotifications } from "./DesktopNotifications";
import { DesktopUnreadBadge } from "./DesktopUnreadBadge";
import { desktopDownloadAttachment } from "./desktopDownloadAttachment";
import "@tudu/ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <AttachmentDownloadProvider download={desktopDownloadAttachment}>
        <DesktopNotifications>
          <DesktopUnreadBadge />
          <DesktopUpdater>
            <App />
          </DesktopUpdater>
        </DesktopNotifications>
      </AttachmentDownloadProvider>
    </AppProviders>
  </StrictMode>,
);
