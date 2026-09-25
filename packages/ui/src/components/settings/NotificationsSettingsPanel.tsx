import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  REGULAR_INTERVAL_MINUTES,
  resolveClientTimezone,
  type RegularIntervalMinutes,
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
  disabled?: boolean;
}) {
  return (
    <>
      <span className={props.disabled ? "text-faint" : undefined}>{props.label}</span>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
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

function isValidHm(value: string): boolean {
  return /^(\d{1,2}):(\d{2})$/.test(value.trim());
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
  const [workStartDraft, setWorkStartDraft] = useState(prefs.workHoursStart);
  const [workEndDraft, setWorkEndDraft] = useState(prefs.workHoursEnd);
  const hydratedFromServerRef = useRef(false);

  useEffect(() => {
    if (!serverPrefs || hydratedFromServerRef.current) {
      return;
    }
    hydratedFromServerRef.current = true;
    const next = serverPrefsToLocal(serverPrefs);
    setPrefs(next);
    setWorkStartDraft(next.workHoursStart);
    setWorkEndDraft(next.workHoursEnd);
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

  function commitWorkHours(field: "start" | "end") {
    const draft = field === "start" ? workStartDraft : workEndDraft;
    if (!isValidHm(draft)) {
      if (field === "start") {
        setWorkStartDraft(prefs.workHoursStart);
      } else {
        setWorkEndDraft(prefs.workHoursEnd);
      }
      return;
    }
    if (field === "start") {
      saveLocal({ ...prefs, workHoursStart: draft.trim() });
    } else {
      saveLocal({ ...prefs, workHoursEnd: draft.trim() });
    }
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
            Regular updates
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            Fires on the clock during working hours with how many tasks are left
            today. These alerts do not appear in the bell.
          </p>
          <div className="mt-[12px] grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="Regular updates"
              checked={prefs.regularEnabled}
              onCheckedChange={(regularEnabled) =>
                saveLocal({ ...prefs, regularEnabled })
              }
              ariaLabel="Regular update notifications"
            />
          </div>

          {prefs.regularEnabled ? (
            <>
              <div className="mt-[14px] text-[12px] text-faint">Interval</div>
              <ToggleGroup
                type="single"
                value={String(prefs.regularIntervalMinutes)}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  const minutes = Number.parseInt(value, 10) as RegularIntervalMinutes;
                  if (REGULAR_INTERVAL_MINUTES.includes(minutes)) {
                    saveLocal({ ...prefs, regularIntervalMinutes: minutes });
                  }
                }}
                className="mt-[8px] flex flex-wrap justify-start gap-[8px]"
                aria-label="Regular update interval"
              >
                {REGULAR_INTERVAL_MINUTES.map((minutes) => (
                  <ToggleGroupItem
                    key={minutes}
                    value={String(minutes)}
                    aria-label={`${minutes} minutes`}
                    className="border border-hair px-[12px] py-[6px] text-[12px] data-[state=on]:border-ink data-[state=on]:bg-hair"
                  >
                    {minutes === 60 ? "1h" : minutes === 120 ? "2h" : `${minutes}m`}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <div className="mt-[20px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
                Working hours
              </div>
              <div className="mt-[12px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
                <span>Work day starts (HH:MM)</span>
                <Input
                  value={workStartDraft}
                  onChange={(event) => setWorkStartDraft(event.target.value)}
                  onBlur={() => commitWorkHours("start")}
                  aria-label="Work hours start"
                />
                <span>Work day ends (HH:MM)</span>
                <Input
                  value={workEndDraft}
                  onChange={(event) => setWorkEndDraft(event.target.value)}
                  onBlur={() => commitWorkHours("end")}
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

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Events
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            JIRA, inbox, comments, task changes by others, and new app versions.
            Events appear in the bell and can alert you anytime.
          </p>
          <div className="mt-[12px] grid max-w-[420px] grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="Events"
              checked={prefs.eventsEnabled}
              onCheckedChange={(eventsEnabled) =>
                saveLocal({ ...prefs, eventsEnabled })
              }
              ariaLabel="Event notifications"
            />
            <PrefRow
              label="JIRA"
              checked={prefs.eventsJira}
              disabled={!prefs.eventsEnabled}
              onCheckedChange={(eventsJira) =>
                saveLocal({ ...prefs, eventsJira })
              }
              ariaLabel="JIRA event notifications"
            />
            <PrefRow
              label="Inbox"
              checked={prefs.eventsInbox}
              disabled={!prefs.eventsEnabled}
              onCheckedChange={(eventsInbox) =>
                saveLocal({ ...prefs, eventsInbox })
              }
              ariaLabel="Inbox event notifications"
            />
            <PrefRow
              label="Comments"
              checked={prefs.eventsComments}
              disabled={!prefs.eventsEnabled}
              onCheckedChange={(eventsComments) =>
                saveLocal({ ...prefs, eventsComments })
              }
              ariaLabel="Comment event notifications"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
