import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { makeStore } from "@tudu/store";
import { NotificationsSettingsPanel } from "./NotificationsSettingsPanel";
import { NotificationOsProvider } from "@/providers/NotificationOsContext";
import { readNotificationPrefs } from "@/lib/notificationPrefs";

const updateSettings = vi.fn();

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetNotificationSettingsQuery: () => ({
      data: {
        ...readNotificationPrefs(),
        lastActiveAt: null,
        lastJiraPollAt: null,
        clientAppVersion: null,
      },
      isLoading: false,
    }),
    useUpdateNotificationSettingsMutation: () => [updateSettings],
  };
});

describe("NotificationsSettingsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    updateSettings.mockClear();
  });

  it("saves kind toggles and can enable banners", async () => {
    const user = userEvent.setup();
    const requestOsPermission = vi.fn().mockResolvedValue(true);
    const store = makeStore();

    render(
      <Provider store={store}>
        <NotificationOsProvider
          value={{
            requestOsPermission,
            showOsNotification: vi.fn(),
          }}
        >
          <NotificationsSettingsPanel />
        </NotificationOsProvider>
      </Provider>,
    );

    await user.click(screen.getByRole("switch", { name: "Inbox notifications" }));
    expect(readNotificationPrefs().inbox).toBe(false);

    await user.click(screen.getByRole("button", { name: "Enable notifications" }));
    expect(requestOsPermission).toHaveBeenCalled();
    expect(readNotificationPrefs().osEnabled).toBe(true);
    expect(screen.getByRole("button", { name: "Banners on" })).toBeInTheDocument();
  });
});
