import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { effectiveDayIso } from "@tudu/shared";
import { InviteDialog } from "@/components/orgs/InviteDialog";
import { CoworkerPersonRow } from "@/components/coworkers/CoworkerPersonRow";
import { Button } from "@/components/ui/button";
import { useListCoworkerRosterQuery } from "@tudu/store";

export function CoworkersRoute() {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string };
  const date = effectiveDayIso();
  const now = new Date();
  const { data, isLoading } = useListCoworkerRosterQuery({
    slug: orgSlug,
    date,
  });
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-rule px-[22px] py-[18px]">
        <h1 className="text-[18px] font-bold tracking-[-0.02em]">
          In {data?.orgName ?? "your organization"}
        </h1>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          Invite co-workers
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-[22px] py-6 text-[13px] text-muted-foreground">
            Loading co-workers…
          </p>
        ) : (
          (data?.members ?? []).map((member) => (
            <CoworkerPersonRow
              key={member.userId}
              orgSlug={orgSlug}
              entry={member}
              now={now}
            />
          ))
        )}
      </div>
      <p className="border-t border-hair px-[22px] py-3 text-[11px] text-muted-foreground">
        Slipping = carried two days or more, or past deadline
      </p>
      <InviteDialog slug={orgSlug} open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
