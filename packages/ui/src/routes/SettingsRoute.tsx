import { useState } from "react";
import {
  AccountSettingsPanel,
} from "@/components/settings/AccountSettingsPanel";
import {
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";
import { SettingsStubPanel } from "@/components/settings/SettingsStubPanel";

const stubTitles: Record<Exclude<SettingsSection, "account">, string> = {
  general: "General",
  jira: "JIRA connection",
  manager: "Manager, privacy and rollover",
  notifications: "Notifications and sync",
};

export function SettingsRoute() {
  const [section, setSection] = useState<SettingsSection>("account");

  return (
    <div className="grid h-full min-h-0 grid-cols-[214px_minmax(0,1fr)] bg-card">
      <div className="border-r border-hair">
        <SettingsSidebar
          active={section}
          onSelect={setSection}
          version="0.17.0"
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
