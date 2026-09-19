import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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

export function NotificationsSettingsPanel() {
  const os = useNotificationOs();
  const { data: serverPrefs, isLoading } = useGetNotificationSettingsQuery();
  const [updateSettings] = useUpdateNotificationSettingsMutation();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    defaultNotificationPrefs,
  );
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (serverPrefs) {
      const next = serverPrefsToLocal(serverPrefs);
      setPrefs(next);
      writeNotificationPrefs(next);
    }
  }, [serverPrefs]);

  function saveLocal(next: NotificationPrefs) {
    setPrefs(next);
    writeNotificationPrefs(next);
    void updateSettings(next);
  }

  async function enableBanners() {
    const granted = await os.requestOsPermission();
    if (!granted) {
      setHint("Notifications are blocked in this browser or on this Mac.");
      saveLocal({ ...prefs, osEnabled: false });
      return;
    }
    setHint(null);
    saveLocal({ ...prefs, osEnabled: true });
  }

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
            Notify me about
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <PrefRow
              label="A task arriving in Inbox"
              checked={prefs.inbox}
              onCheckedChange={(inbox) => saveLocal({ ...prefs, inbox })}
              ariaLabel="Inbox notifications"
            />
            <PrefRow
              label="A comment on a task I can see"
              checked={prefs.comments}
              onCheckedChange={(comments) => saveLocal({ ...prefs, comments })}
              ariaLabel="Comment notifications"
            />
            <PrefRow
              label="Someone changing or deleting one of my tasks"
              checked={prefs.taskChanges}
              onCheckedChange={(taskChanges) =>
                saveLocal({ ...prefs, taskChanges })
              }
              ariaLabel="Task change notifications"
            />
            <PrefRow
              label="Linked JIRA issues (updated in the last 3 months)"
              checked={prefs.jira}
              onCheckedChange={(jira) => saveLocal({ ...prefs, jira })}
              ariaLabel="JIRA notifications"
            />
            <PrefRow
              label="Daily focus and deadline reminders"
              checked={prefs.reminders}
              onCheckedChange={(reminders) => saveLocal({ ...prefs, reminders })}
              ariaLabel="Reminder notifications"
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
            JIRA sync interval (minutes)
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            Polls issues linked to your tasks. Faster while you are active, slower
            when idle.
          </p>
          <div className="mt-[12px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
            <span>While active</span>
            <Input
              type="number"
              min={1}
              max={120}
              value={String(prefs.jiraPollActiveMinutes)}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(value)) {
                  saveLocal({ ...prefs, jiraPollActiveMinutes: value });
                }
              }}
              aria-label="JIRA active poll minutes"
            />
            <span>While idle</span>
            <Input
              type="number"
              min={1}
              max={240}
              value={String(prefs.jiraPollIdleMinutes)}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(value)) {
                  saveLocal({ ...prefs, jiraPollIdleMinutes: value });
                }
              }}
              aria-label="JIRA idle poll minutes"
            />
          </div>
          {serverPrefs?.lastJiraPollAt ? (
            <p className="mt-[8px] text-[12px] text-faint">
              Last JIRA poll: {new Date(serverPrefs.lastJiraPollAt).toLocaleString()}
            </p>
          ) : null}
        </div>

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Reminders
          </div>
          <div className="mt-[12px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
            <span>Daily digest time (HH:MM)</span>
            <Input
              value={prefs.digestTimeLocal}
              onChange={(event) =>
                saveLocal({ ...prefs, digestTimeLocal: event.target.value })
              }
              aria-label="Digest time"
            />
            <span>Late task interval (minutes)</span>
            <Input
              type="number"
              min={15}
              max={720}
              value={String(prefs.lateReminderMinutes)}
              onChange={(event) => {
                const value = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(value)) {
                  saveLocal({ ...prefs, lateReminderMinutes: value });
                }
              }}
              aria-label="Late reminder minutes"
            />
          </div>
        </div>

        <div className="border-t border-hair pt-[20px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Quiet hours and timezone
          </div>
          <div className="mt-[12px] grid max-w-[360px] grid-cols-[1fr_80px] items-center gap-x-[12px] gap-y-[10px] text-[13px]">
            <span>Timezone (IANA)</span>
            <Input
              value={prefs.timezone}
              onChange={(event) =>
                saveLocal({ ...prefs, timezone: event.target.value })
              }
              aria-label="Timezone"
            />
            <span>Quiet from</span>
            <Input
              value={prefs.quietHoursStart}
              onChange={(event) =>
                saveLocal({ ...prefs, quietHoursStart: event.target.value })
              }
              aria-label="Quiet hours start"
            />
            <span>Quiet until</span>
            <Input
              value={prefs.quietHoursEnd}
              onChange={(event) =>
                saveLocal({ ...prefs, quietHoursEnd: event.target.value })
              }
              aria-label="Quiet hours end"
            />
          </div>
          <p className="mt-[8px] max-w-[520px] text-[12px] text-faint">
            Push and OS banners pause during quiet hours. The bell list still
            records everything.
          </p>
        </div>

        <div className="border-t border-hair pt-[20px]">
          <button
            type="button"
            className="border border-ink px-[14px] py-[8px] text-[12.5px] font-semibold"
            onClick={() => {
              void enableBanners();
            }}
          >
            {prefs.osEnabled ? "Banners on" : "Enable notifications"}
          </button>
          <p className="mt-[10px] max-w-[480px] text-[12px] text-faint">
            Banners show while Tudu is open. On the web app, enabling this also
            registers for push when Firebase is configured. The bell list always
            keeps a copy.
          </p>
          {hint ? (
            <p className="mt-[8px] text-[12px] text-destructive">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
