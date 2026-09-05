import { Link2 } from "lucide-react";
import { toast } from "sonner";

export function JiraColumnEmpty() {
  return (
    <div className="flex h-full flex-col bg-card">
      <header className="px-[20px] pb-[12px] pt-[24px]">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          JIRA · assigned to me
        </span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-[14px] px-[28px] text-center">
        <Link2 size={22} strokeWidth={1.6} className="text-ghost" aria-hidden />
        <div className="text-[14px] font-semibold">No JIRA connected</div>
        <p className="max-w-[240px] text-[12.5px] leading-[1.6] text-muted-foreground">
          Connect Atlassian and the issues assigned to you appear here, ready to
          pull into a day.
        </p>
        <button
          type="button"
          className="bg-primary px-[14px] py-[8px] text-[12.5px] font-bold text-primary-foreground"
          onClick={() => {
            toast("JIRA connection lands in step 10");
          }}
        >
          Connect JIRA
        </button>
        <p className="text-[11.5px] text-faint">Tudu works without it</p>
      </div>
    </div>
  );
}
