import { Navigate, useParams } from "@tanstack/react-router";
import { useGetMeQuery, useGetOrgQuery } from "@tudu/store";
import { OrgAdminPanel } from "@/components/orgs/OrgAdminPanel";

export function OrgAdminRoute() {
  const { orgSlug } = useParams({ strict: false }) as { orgSlug: string };
  const { data: me } = useGetMeQuery();
  const { data: org, isLoading } = useGetOrgQuery(orgSlug);

  if (isLoading) {
    return null;
  }

  if (!org || org.role !== "owner" || !me?.id) {
    return <Navigate to="/o/$orgSlug" params={{ orgSlug }} />;
  }

  return <OrgAdminPanel orgSlug={orgSlug} viewerId={me.id} />;
}
