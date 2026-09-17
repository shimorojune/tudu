import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  AccountSettingsPanel,
} from "@/components/settings/AccountSettingsPanel";
import { NotificationsSettingsPanel } from "@/components/settings/NotificationsSettingsPanel";
import { ProjectsSettingsPanel } from "@/components/settings/ProjectsSettingsPanel";
import { JiraSettingsPanel } from "@/components/settings/JiraSettingsPanel";
import {
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";
import { GeneralSettingsPanel } from "@/components/settings/GeneralSettingsPanel";
import { SettingsStubPanel } from "@/components/settings/SettingsStubPanel";
import { APP_VERSION } from "@/lib/appVersion";

const stubTitles: Record<
  Exclude<
    SettingsSection,
    "account" | "general" | "notifications" | "projects" | "jira"
  >,
  string
> = {
  manager: "Manager, privacy and rollover",
};

const settingsSections = new Set<SettingsSection>([
  "account",
  "general",
  "projects",
  "jira",
  "manager",
  "notifications",
]);

function sectionFromSearch(section: string | undefined): SettingsSection {
  return section && settingsSections.has(section as SettingsSection)
    ? (section as SettingsSection)
    : "account";
}

export function SettingsRoute() {
  const search = useSearch({ strict: false }) as { section?: string };
  const navigate = useNavigate();
  const [section, setSection] = useState<SettingsSection>(() =>
    sectionFromSearch(search.section),
  );

  useEffect(() => {
    setSection(sectionFromSearch(search.section));
  }, [search.section]);

  function selectSection(next: SettingsSection) {
    setSection(next);
    void navigate({
      to: "/settings",
      search: { section: next },
    });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-card md:grid-cols-[214px_minmax(0,1fr)]">
      <div className="border-b border-hair md:border-b-0 md:border-r">
        <SettingsSidebar
          active={section}
          onSelect={selectSection}
          version={APP_VERSION}
        />
      </div>
      <div className="min-h-0 bg-card">
        {section === "account" ? (
          <AccountSettingsPanel />
        ) : section === "general" ? (
          <GeneralSettingsPanel />
        ) : section === "notifications" ? (
          <NotificationsSettingsPanel />
        ) : section === "projects" ? (
          <ProjectsSettingsPanel />
        ) : section === "jira" ? (
          <JiraSettingsPanel />
        ) : (
          <SettingsStubPanel title={stubTitles[section]} />
        )}
      </div>
    </div>
  );
}
