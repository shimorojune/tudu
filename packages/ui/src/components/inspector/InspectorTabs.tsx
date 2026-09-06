import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type InspectorTab = "details" | "comments" | "timeline";

export type InspectorTabsProps = {
  active: InspectorTab;
  commentCount: number;
  onChange: (tab: InspectorTab) => void;
  onClose: () => void;
};

const TABS: { id: InspectorTab; label: string; showCount?: boolean }[] = [
  { id: "details", label: "Details" },
  { id: "comments", label: "Comments", showCount: true },
  { id: "timeline", label: "Timeline" },
];

export function InspectorTabs({
  active,
  commentCount,
  onChange,
  onClose,
}: InspectorTabsProps) {
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-[18px] border-b border-hair px-[24px] text-[12.5px]">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "py-[13px]",
              isActive
                ? "font-bold shadow-[inset_0_-2px_0_var(--foreground)]"
                : "text-muted-foreground",
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.showCount ? (
              <>
                {" "}
                <span className="tabular-nums text-faint">{commentCount}</span>
              </>
            ) : null}
          </button>
        );
      })}
      <button
        type="button"
        className="ml-auto flex size-[15px] items-center justify-center text-muted-foreground"
        aria-label="Close inspector"
        onClick={onClose}
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
