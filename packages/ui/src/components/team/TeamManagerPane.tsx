import type { Person } from "@tudu/shared";
import { TeamAvatar } from "@/components/team/TeamAvatar";
import { personFirstName } from "@/lib/person";

export type TeamManagerPaneProps = {
  manager: Person | null;
};

export function TeamManagerPane({ manager }: TeamManagerPaneProps) {
  return (
    <aside className="flex min-h-0 flex-col bg-background" aria-label="I report to">
      <div className="border-b border-hair px-[16px] py-[20px] md:px-[24px]">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          I report to
        </div>
      </div>
      {manager ? (
        <div className="flex min-h-0 flex-1 flex-col gap-[14px] px-[16px] py-[18px] md:px-[24px]">
          <div className="flex min-w-0 items-center gap-[14px]">
            <TeamAvatar name={manager.name} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold">{manager.name}</div>
              <div className="text-[12px] text-muted-foreground">
                {manager.email} · sees your day, minus private tasks
              </div>
            </div>
          </div>
          <p className="text-[12px] leading-[1.45] text-muted-foreground">
            {personFirstName(manager.name)} can read, comment, reorder, delete, and
            send to Inbox. They cannot edit, complete, or see private tasks.
          </p>
        </div>
      ) : (
        <p className="px-[16px] py-[20px] text-[14px] text-muted-foreground md:px-[24px]">
          You do not report to anyone yet.
        </p>
      )}
    </aside>
  );
}
