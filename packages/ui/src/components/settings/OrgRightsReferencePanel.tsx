import { useState } from "react";
import { rightsAudienceLabel, rightsReferenceRows } from "@tudu/shared";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type OrgRightsReferencePanelProps = {
  orgName: string;
};

export function OrgRightsReferencePanel({
  orgName,
}: OrgRightsReferencePanelProps) {
  const [open, setOpen] = useState(false);
  const rows = rightsReferenceRows(orgName);

  return (
    <div className="border border-rule">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-[13px] font-semibold">Who can do what</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-rule">
          <div className="border-b border-rule px-[18px] py-[14px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Rights in {orgName}
            </div>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[minmax(0,1fr)_104px] items-center gap-x-[14px] border-b border-hair px-[18px] py-[10px] last:border-b-0"
            >
              <span className="text-[13px] leading-[1.45]">{row.label}</span>
              <span
                className={cn(
                  "justify-self-end whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.1em]",
                  row.audience === "owner" || row.audience === "owners"
                    ? "bg-foreground px-[7px] py-[3px] text-card"
                    : row.audience === "nobody"
                      ? "text-primary-text"
                      : "text-muted-foreground",
                )}
              >
                {rightsAudienceLabel(row.audience)}
              </span>
            </div>
          ))}
          <p className="px-[18px] py-3 text-[12px] text-faint">
            Owners get the admin panel, not extra rights over tasks.
          </p>
        </div>
      ) : null}
    </div>
  );
}
