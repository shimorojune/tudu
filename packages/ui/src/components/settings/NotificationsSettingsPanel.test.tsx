import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationsSettingsPanel } from "./NotificationsSettingsPanel";
import { NotificationOsProvider } from "@/providers/NotificationOsContext";
import { readNotificationPrefs } from "@/lib/notificationPrefs";

describe("NotificationsSettingsPanel", () => {
  it("saves kind toggles and can enable banners", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    const requestOsPermission = vi.fn().mockResolvedValue(true);

    render(
      <NotificationOsProvider
        value={{
          requestOsPermission,
          showOsNotification: vi.fn(),
        }}
      >
        <NotificationsSettingsPanel />
      </NotificationOsProvider>,
    );

    await user.click(screen.getByRole("switch", { name: "Inbox notifications" }));
    expect(readNotificationPrefs().inbox).toBe(false);

    await user.click(screen.getByRole("button", { name: "Enable notifications" }));
    expect(requestOsPermission).toHaveBeenCalled();
    expect(readNotificationPrefs().osEnabled).toBe(true);
    expect(screen.getByRole("button", { name: "Banners on" })).toBeInTheDocument();
  });
});
