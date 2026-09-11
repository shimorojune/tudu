import { cn } from "@/lib/utils";

export type SettingsSection =
  | "account"
  | "general"
  | "jira"
  | "manager"
  | "notifications";

type SettingsSidebarProps = {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  version: string;
};

const sections: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "account", label: "Account and login" },
  { id: "jira", label: "JIRA connection" },
  { id: "manager", label: "Manager, privacy and rollover" },
  { id: "notifications", label: "Notifications and sync" },
];

export function SettingsSidebar({
  active,
  onSelect,
  version,
}: SettingsSidebarProps) {
  return (
    <nav
      aria-label="Settings"
      className="flex bg-background py-[10px] text-[13.5px] max-md:items-center max-md:overflow-x-auto max-md:px-[8px] md:h-full md:flex-col md:py-[14px]"
    >
      {sections.map((section) => {
        const selected = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            className={cn(
              "px-[18px] py-[8px] text-left whitespace-nowrap",
              selected
                ? "bg-card font-semibold shadow-[inset_2px_0_0_var(--foreground)]"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onSelect(section.id)}
          >
            {section.label}
          </button>
        );
      })}
      <div className="mt-auto hidden px-[18px] py-[10px] text-[11.5px] text-faint md:block">
        Tudu {version}
      </div>
    </nav>
  );
}
