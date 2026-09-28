import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { defaultNotificationPreferences } from "@tudu/shared";
import { makeStore } from "@tudu/store";
import {
  NotificationsSettingsPanel,
  resetOsPermissionSyncForTests,
} from "./NotificationsSettingsPanel";
import { NotificationOsProvider } from "@/providers/NotificationOsContext";
import { readNotificationPrefs } from "@/lib/notificationPrefs";

const updateSettings = vi.fn();

vi.mock("@tudu/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tudu/store")>();
  return {
    ...actual,
    useGetNotificationSettingsQuery: () => ({
      data: {
        ...defaultNotificationPreferences(),
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
    resetOsPermissionSyncForTests();
  });

  it("saves event toggles and can enable system alerts", async () => {
    const user = userEvent.setup();
    const requestOsPermission = vi.fn().mockResolvedValue(true);
    const getOsPermissionGranted = vi.fn().mockResolvedValue(false);
    const store = makeStore();

    render(
      <Provider store={store}>
        <NotificationOsProvider
          value={{
            getOsPermissionGranted,
            requestOsPermission,
            showOsNotification: vi.fn(),
          }}
        >
          <NotificationsSettingsPanel />
        </NotificationOsProvider>
      </Provider>,
    );

    await user.click(screen.getByRole("switch", { name: "Event notifications" }));
    expect(readNotificationPrefs().eventsEnabled).toBe(false);

    await user.click(screen.getByRole("switch", { name: "System alerts" }));
    expect(requestOsPermission).toHaveBeenCalled();
    expect(readNotificationPrefs().osEnabled).toBe(true);
    expect(screen.getByText("Alerts are on.")).toBeInTheDocument();
  });

  it("disables source toggles when events master is off", async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <NotificationOsProvider
          value={{
            getOsPermissionGranted: vi.fn().mockResolvedValue(true),
            requestOsPermission: vi.fn(),
            showOsNotification: vi.fn(),
          }}
        >
          <NotificationsSettingsPanel />
        </NotificationOsProvider>
      </Provider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "JIRA event notifications" }),
      ).toBeEnabled();
    });
    await user.click(screen.getByRole("switch", { name: "Event notifications" }));
    await waitFor(() => {
      expect(
        screen.getByRole("switch", { name: "JIRA event notifications" }),
      ).toBeDisabled();
    });
  });

  it("persists interval selection", async () => {
    const user = userEvent.setup();
    const store = makeStore();

    render(
      <Provider store={store}>
        <NotificationOsProvider
          value={{
            getOsPermissionGranted: vi.fn().mockResolvedValue(true),
            requestOsPermission: vi.fn(),
            showOsNotification: vi.fn(),
          }}
        >
          <NotificationsSettingsPanel />
        </NotificationOsProvider>
      </Provider>,
    );

    await user.click(screen.getByRole("radio", { name: "30 minutes" }));
    expect(readNotificationPrefs().regularIntervalMinutes).toBe(30);
  });
});
