import { useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  AccountSettingsPanel,
} from "@/components/settings/AccountSettingsPanel";
import { NotificationsSettingsPanel } from "@/components/settings/NotificationsSettingsPanel";
import { ProjectsSettingsPanel } from "@/components/settings/ProjectsSettingsPanel";
import {
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";
import { SettingsStubPanel } from "@/components/settings/SettingsStubPanel";
import { APP_VERSION } from "@/lib/appVersion";

const stubTitles: Record<
  Exclude<SettingsSection, "account" | "notifications" | "projects">,
  string
> = {
  general: "General",
  jira: "JIRA connection",
  manager: "Manager, privacy and rollover",
};

export function SettingsRoute() {
  const search = useSearch({ strict: false }) as { section?: string };
  const [section, setSection] = useState<SettingsSection>(
    search.section === "projects" ? "projects" : "account",
  );

  useEffect(() => {
    if (search.section === "projects") {
      setSection("projects");
    }
  }, [search.section]);

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
        ) : section === "notifications" ? (
          <NotificationsSettingsPanel />
        ) : section === "projects" ? (
          <ProjectsSettingsPanel />
        ) : (
          <SettingsStubPanel title={stubTitles[section]} />
        )}
      </div>
    </div>
  );
}
