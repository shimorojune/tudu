import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { can } from "@tudu/shared";
import {
  useGetOrgQuery,
  useListOrgAuditQuery,
  useListOrgMembersQuery,
} from "@tudu/store";
import { InviteDialog } from "@/components/orgs/InviteDialog";
import { OrgBadgeDialog } from "@/components/orgs/OrgBadgeDialog";
import { Button } from "@/components/ui/button";
import { SPACE_COLOR_HEX } from "@tudu/shared";

export type OrgAdminPanelProps = {
  orgSlug: string;
  viewerId: string;
};

export function OrgAdminPanel({ orgSlug, viewerId }: OrgAdminPanelProps) {
  const { data: org } = useGetOrgQuery(orgSlug);
  const { data: membersData } = useListOrgMembersQuery(orgSlug);
  const { data: auditData } = useListOrgAuditQuery({ slug: orgSlug });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false);

  if (!org) {
    return null;
  }

  const isOwner = can("adminPanel", {
    viewerId,
    viewerRole: org.role,
    task: {
      ownerId: viewerId,
      orgId: org.id,
      isPrivate: false,
      pendingRequestId: null,
    },
  });

  if (!isOwner) {
    return (
      <div className="px-[28px] py-[24px] text-[14px] text-muted-foreground">
        Only owners can open the admin panel.
      </div>
    );
  }

  const members = membersData?.members ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center gap-[14px] border-b border-rule px-[28px] py-[18px]">
        <span
          className="size-5 shrink-0"
          style={{ backgroundColor: SPACE_COLOR_HEX[org.color] }}
        />
        <h1 className="text-[16px] font-bold tracking-[-0.01em]">{org.name}</h1>
        <Button type="button" variant="outline" size="sm" onClick={() => setBadgeOpen(true)}>
          Name, colour and image
        </Button>
        <span className="ml-auto text-[12px] text-faint">
          {org.memberCount} co-workers · {org.ownerCount} owners ·{" "}
          {org.pendingInviteCount} invites pending
        </span>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          Invite co-workers
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto border-r border-hair">
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-4 border-b border-rule px-[28px] py-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
            <span>Co-worker</span>
            <span>Role</span>
          </div>
          {members.map((member) => (
            <div
              key={member.userId}
              className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-4 border-b border-hair px-[28px] py-[14px]"
            >
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">
                  {member.userId === viewerId ? "You" : member.name ?? member.email}
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  {member.email}
                </div>
              </div>
              <div className="text-[12.5px] capitalize">{member.role}</div>
            </div>
          ))}
        </div>
        <aside className="min-h-0 overflow-y-auto p-[20px]">
          <h2 className="mb-3 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
            Audit log
          </h2>
          <ul className="flex flex-col gap-3 text-[12.5px]">
            {(auditData?.entries ?? []).slice(0, 12).map((entry) => (
              <li key={entry.id} className="border-b border-hair pb-2">
                <div className="font-semibold">{entry.kind}</div>
                <div className="text-faint">
                  {entry.actorName ?? "System"} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="border-t border-rule px-[28px] py-3 text-[12px] text-muted-foreground">
        <Link to="/o/$orgSlug/coworkers" params={{ orgSlug }} className="underline">
          Back to co-workers
        </Link>
      </div>

      <InviteDialog slug={orgSlug} open={inviteOpen} onOpenChange={setInviteOpen} />
      <OrgBadgeDialog slug={orgSlug} open={badgeOpen} onOpenChange={setBadgeOpen} />
    </div>
  );
}
