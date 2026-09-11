import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  readNotificationPrefs,
  writeNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notificationPrefs";
import { useNotificationOs } from "@/providers/NotificationOsContext";

export function NotificationsSettingsPanel() {
  const os = useNotificationOs();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => readNotificationPrefs());
  const [hint, setHint] = useState<string | null>(null);

  function save(next: NotificationPrefs) {
    setPrefs(next);
    writeNotificationPrefs(next);
  }

  async function enableBanners() {
    const granted = await os.requestOsPermission();
    if (!granted) {
      setHint("Notifications are blocked in this browser or on this Mac.");
      save({ ...prefs, osEnabled: false });
      return;
    }
    setHint(null);
    save({ ...prefs, osEnabled: true });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[30px] py-[26px]">
      <div className="flex flex-col gap-[22px]">
        <div className="flex flex-col gap-[13px]">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Notify me about
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_46px] items-center gap-x-[16px] gap-y-[13px] text-[14px]">
            <span>A task arriving in Inbox</span>
            <Switch
              checked={prefs.inbox}
              onCheckedChange={(inbox) => save({ ...prefs, inbox })}
              aria-label="Inbox notifications"
            />
            <span>A comment on a task I can see</span>
            <Switch
              checked={prefs.comments}
              onCheckedChange={(comments) => save({ ...prefs, comments })}
              aria-label="Comment notifications"
            />
            <span>Someone changing or deleting one of my tasks</span>
            <Switch
              checked={prefs.taskChanges}
              onCheckedChange={(taskChanges) => save({ ...prefs, taskChanges })}
              aria-label="Task change notifications"
            />
          </div>
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
            Banners show while Tudu is open. The bell list always keeps a copy.
          </p>
          {hint ? (
            <p className="mt-[8px] text-[12px] text-destructive">{hint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
