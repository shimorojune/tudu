import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { useGetMeQuery, useListSpacesQuery } from "@tudu/store";
import { HandoverDialog } from "@/components/orgs/HandoverDialog";
import { OrgRightsReferencePanel } from "@/components/settings/OrgRightsReferencePanel";
import { Button } from "@/components/ui/button";

export function OrganizationsSettingsPanel() {
  const { data: me } = useGetMeQuery();
  const { data: spacesData } = useListSpacesQuery();
  const orgSpaces =
    spacesData?.spaces.filter((space) => space.kind === "org") ?? [];
  const [leaveSlug, setLeaveSlug] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-[22px] px-[30px] py-[26px]">
      <div className="flex flex-col gap-[9px]">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">
          Organizations
        </h1>
        <p className="max-w-[52ch] text-[13.5px] text-muted-foreground">
          Shared spaces for your team. Personal tasks stay in your personal
          space.
        </p>
      </div>

      <ul className="flex flex-col border border-rule">
        {orgSpaces.length === 0 ? (
          <li className="px-4 py-6 text-[13px] text-muted-foreground">
            You are not in any organizations yet.
          </li>
        ) : null}
        {orgSpaces.map((space) => (
          <li
            key={space.orgId ?? space.slug}
            className="flex items-center gap-3 border-t border-hair px-4 py-4 first:border-t-0"
          >
            <span
              className="grid size-8 place-items-center text-[13px] font-extrabold text-primary-foreground"
              style={{
                backgroundColor: space.color
                  ? SPACE_COLOR_HEX[space.color]
                  : "var(--foreground)",
              }}
            >
              {space.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{space.name}</div>
              <div className="text-[12px] text-faint capitalize">
                {space.role ?? "member"}
              </div>
            </div>
            {space.slug && space.role === "owner" ? (
              <Button type="button" variant="outline" size="sm" asChild>
                <Link to="/o/$orgSlug/admin" params={{ orgSlug: space.slug }}>
                  Admin
                </Link>
              </Button>
            ) : null}
            {space.slug ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLeaveSlug(space.slug!)}
              >
                Leave
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {orgSpaces[0] ? (
        <OrgRightsReferencePanel orgName={orgSpaces[0].name} />
      ) : (
        <OrgRightsReferencePanel orgName="your organization" />
      )}

      {leaveSlug && me?.id ? (
        <HandoverDialog
          slug={leaveSlug}
          userId={me.id}
          open={Boolean(leaveSlug)}
          onOpenChange={(open) => {
            if (!open) {
              setLeaveSlug(null);
            }
          }}
          title="Leave organization?"
          description="You will lose access to shared tasks in this space."
        />
      ) : null}
    </div>
  );
}
