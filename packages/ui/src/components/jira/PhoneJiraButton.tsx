import { Link2 } from "lucide-react";

export function PhoneJiraButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-end border-b border-hair px-[16px] py-[8px]">
      <button
        type="button"
        aria-label="Open Jira"
        className="inline-flex items-center gap-[6px] border border-rule px-[10px] py-[6px] text-[12px] font-semibold"
        onClick={onClick}
      >
        <Link2 size={13} strokeWidth={1.8} aria-hidden />
        Jira
      </button>
    </div>
  );
}
