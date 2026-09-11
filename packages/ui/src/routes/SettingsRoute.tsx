import { useState } from "react";
import {
  AccountSettingsPanel,
} from "@/components/settings/AccountSettingsPanel";
import {
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";
import { SettingsStubPanel } from "@/components/settings/SettingsStubPanel";
import { APP_VERSION } from "@/lib/appVersion";

const stubTitles: Record<Exclude<SettingsSection, "account">, string> = {
  general: "General",
  jira: "JIRA connection",
  manager: "Manager, privacy and rollover",
  notifications: "Notifications and sync",
};

export function SettingsRoute() {
  const [section, setSection] = useState<SettingsSection>("account");

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-card md:grid-cols-[214px_minmax(0,1fr)]">
      <div className="border-b border-hair md:border-b-0 md:border-r">
        <SettingsSidebar
          active={section}
          onSelect={setSection}
          version={APP_VERSION}
        />
      </div>
      <div className="min-h-0 bg-card">
        {section === "account" ? (
          <AccountSettingsPanel />
        ) : (
          <SettingsStubPanel title={stubTitles[section]} />
        )}
      </div>
    </div>
  );
}
