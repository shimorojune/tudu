import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  applyActivityEnabled,
  applyRemindersEnabled,
  deriveActivityEnabled,
  resolveClientTimezone,
} from "@tudu/shared";
import {
  defaultNotificationPrefs,
  serverPrefsToLocal,
  writeNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notificationPrefs";
import { useNotificationOs } from "@/providers/NotificationOsContext";
import {
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} from "@tudu/store";

const didSyncOsPermissionGlobally = { done: false };

/** @internal Test-only reset for module-level OS permission sync guard. */
export function resetOsPermissionSyncForTests() {
  didSyncOsPermissionGlobally.done = false;
}

function PrefRow(props: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <>
      <span>{props.label}</span>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        aria-label={props.ariaLabel}
      />
    </>
  );
}

function systemAlertsStatus(args: {
  osEnabled: boolean;
  permissionGranted: boolean | null;
  permissionDenied: boolean;
}): string {
  if (args.permissionDenied) {
    return "Alerts are blocked in system settings.";
  }
  if (args.permissionGranted && args.osEnabled) {
    return "Alerts are on.";
  }
  if (args.permissionGranted && !args.osEnabled) {
    return "Alerts paused in Tudu.";
  }
  return "Turn on to allow alerts when Tudu is in the background or closed.";
}

export function NotificationsSettingsPanel() {
  const os = useNotificationOs();
  const { data: serverPrefs, isLoading } = useGetNotificationSettingsQuery();
  const [updateSettings] = useUpdateNotificationSettingsMutation();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    defaultNotificationPrefs,
  );
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );
  const [permissionDenied, setPermissionDenied] = useState(false);
  const hydratedFromServerRef = useRef(false);

  useEffect(() => {
    if (!serverPrefs || hydratedFromServerRef.current) {
      return;
    }
    hydratedFromServerRef.current = true;
    const next = serverPrefsToLocal(serverPrefs);
    setPrefs(next);
    writeNotificationPrefs(next);
  }, [serverPrefs]);

  useEffect(() => {
    let cancelled = false;
    void os.getOsPermissionGranted().then((granted) => {
      if (cancelled) {
        return;
      }
      setPermissionGranted(granted);
      if (typeof Notification !== "undefined") {
        setPermissionDenied(Notification.permission === "denied");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [os]);

  useEffect(() => {
    if (
      didSyncOsPermissionGlobally.done ||
      isLoading ||
      !serverPrefs ||
      permissionGranted === null
    ) {
      return;
    }
    didSyncOsPermissionGlobally.done = true;
    if (permissionGranted && !prefs.osEnabled) {
      const next = { ...prefs, osEnabled: true, timezone: resolveClientTimezone() };
      setPrefs(next);
      writeNotificationPrefs(next);
      void updateSettings(next);
    } else if (permissionDenied && prefs.osEnabled) {
      const next = { ...prefs, osEnabled: false, timezone: resolveClientTimezone() };
      setPrefs(next);
      writeNotificationPrefs(next);
      void updateSettings(next);
    }
  }, [
    isLoading,
    serverPrefs,
    permissionGranted,
    permissionDenied,
    prefs.osEnabled,
    updateSettings,
  ]);

  function saveLocal(next: NotificationPrefs) {
    const withTimezone = {
      ...next,
      timezone: resolveClientTimezone(),
    };
    setPrefs(withTimezone);
    writeNotificationPrefs(withTimezone);
    void updateSettings(withTimezone);
  }

  async function setSystemAlertsEnabled(enabled: boolean) {
    if (enabled) {
      const granted = await os.requestOsPermission();
      setPermissionGranted(granted);
      if (typeof Notification !== "undefined") {
        setPermissionDenied(Notification.permission === "denied");
      }
      if (!granted) {
        saveLocal({ ...prefs, osEnabled: false });
        return;
      }
      saveLocal({ ...prefs, osEnabled: true });
      return;
    }
    saveLocal({ ...prefs, osEnabled: false });
  }

  const activityEnabled = deriveActivityEnabled(prefs);
  const statusLine = systemAlertsStatus({
    osEnabled: prefs.osEnabled,
    permissionGranted,
    permissionDenied,
  });

  if (isLoading && !serverPrefs) {
    return (
      <div className="px-[30px] py-[26px] text-[13px] text-faint">
        Loading notification settings…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[30px] py-[26px]">
      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-[13px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Alerts
          </div>
          <p className="max-w-[520px] text-[12px] text-faint">
            The bell always keeps a history. System alerts reach you when Tudu is
            in the background or closed, and web push when configured.
          </p>
          <div className="grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="System alerts"
              checked={prefs.osEnabled}
              onCheckedChange={(checked) => {
                void setSystemAlertsEnabled(checked);
              }}
              ariaLabel="System alerts"
            />
          </div>
          <p className="max-w-[520px] text-[12px] text-faint">{statusLine}</p>
        </div>

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Activity
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            Inbox, comments, task changes, and linked JIRA updates.
          </p>
          <div className="mt-[12px] grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="Activity on tasks and JIRA"
              checked={activityEnabled}
              onCheckedChange={(enabled) =>
                saveLocal(applyActivityEnabled(prefs, enabled))
              }
              ariaLabel="Activity notifications"
            />
            <PrefRow
              label="New app versions"
              checked={prefs.appUpdate}
              onCheckedChange={(appUpdate) => saveLocal({ ...prefs, appUpdate })}
              ariaLabel="App update notifications"
            />
          </div>
        </div>

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Work reminders
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            Periodic check-ins during working hours: what you are on, what is
            next, and what needs attention.
          </p>
          <div className="mt-[12px] grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="Work reminder check-ins"
              checked={prefs.reminders}
              onCheckedChange={(enabled) =>
                saveLocal(applyRemindersEnabled(prefs, enabled))
              }
              ariaLabel="Work reminder notifications"
            />
          </div>

          {prefs.reminders ? (
            <>
              <div className="mt-[14px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
                <span>Check-in interval (minutes)</span>
                <Input
                  type="number"
                  min={15}
                  max={720}
                  value={String(prefs.focusCheckInMinutes)}
                  onChange={(event) => {
                    const value = Number.parseInt(event.target.value, 10);
                    if (Number.isFinite(value)) {
                      saveLocal({ ...prefs, focusCheckInMinutes: value });
                    }
                  }}
                  aria-label="Check-in interval minutes"
                />
              </div>

              <div className="mt-[20px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
                Working hours
              </div>
              <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
                Reminders only fire during these hours in your local timezone.
              </p>
              <div className="mt-[12px] grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
                <PrefRow
                  label="Limit reminders to working hours"
                  checked={prefs.workHoursEnabled}
                  onCheckedChange={(workHoursEnabled) =>
                    saveLocal({ ...prefs, workHoursEnabled })
                  }
                  ariaLabel="Working hours limit"
                />
              </div>
              <div className="mt-[12px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
                <span>Work day starts (HH:MM)</span>
                <Input
                  value={prefs.workHoursStart}
                  onChange={(event) =>
                    saveLocal({ ...prefs, workHoursStart: event.target.value })
                  }
                  aria-label="Work hours start"
                />
                <span>Work day ends (HH:MM)</span>
                <Input
                  value={prefs.workHoursEnd}
                  onChange={(event) =>
                    saveLocal({ ...prefs, workHoursEnd: event.target.value })
                  }
                  aria-label="Work hours end"
                />
              </div>
              <div className="mt-[12px] flex flex-wrap gap-[10px] text-[12px]">
                {(
                  [
                    [1, "Mon"],
                    [2, "Tue"],
                    [3, "Wed"],
                    [4, "Thu"],
                    [5, "Fri"],
                    [6, "Sat"],
                    [7, "Sun"],
                  ] as const
                ).map(([day, label]) => {
                  const active = prefs.workDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={active}
                      aria-label={`Work day ${label}`}
                      className={
                        active
                          ? "border border-ink bg-hair px-[10px] py-[6px] font-semibold"
                          : "border border-hair px-[10px] py-[6px] text-faint"
                      }
                      onClick={() => {
                        const next = active
                          ? prefs.workDays.filter((value) => value !== day)
                          : [...prefs.workDays, day].sort((a, b) => a - b);
                        if (next.length === 0) {
                          return;
                        }
                        saveLocal({ ...prefs, workDays: next });
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
