import { Link, useParams, useSearch } from "@tanstack/react-router";
import {
  effectiveDayIso,
  type CoworkerDayTask,
  type ProposalFields,
  type Task,
} from "@tudu/shared";
import {
  useGetCoworkerDayQuery,
  useGetMeQuery,
  useListOrgMembersQuery,
  useListSpacesQuery,
} from "@tudu/store";
import { useMemo, useState } from "react";
import { CoworkerDayBuckets } from "@/components/coworkers/CoworkerDayBuckets";
import { ProposalComposer } from "@/components/requests/ProposalComposer";
import { SendTaskDialog } from "@/components/requests/SendTaskDialog";
import { CommentsTab } from "@/components/inspector/CommentsTab";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { Button } from "@/components/ui/button";
import { useViewportBand } from "@/hooks/useViewportBand";
import { CoworkerDayStepper } from "@/components/chrome/CoworkerDayStepper";

function stubTask(row: CoworkerDayTask, date: string): Task {
  const stamp = new Date().toISOString();
  return {
    id: row.id,
    title: row.title,
    description: null,
    scheduledDate: date,
    bucket: row.bucket,
    position: row.position,
    startDate: null,
    deadline: row.deadline,
    completedAt: row.completedAt,
    inProgress: false,
    carriedDays: row.carriedDays,
    carriedSince: null,
    isPrivate: false,
    createdAt: stamp,
    updatedAt: stamp,
    subtasks: [],
    commentCount: 0,
    project: null,
    jiraLinks: [],
    orgId: null,
    taskNumber: row.taskNumber,
    taskKey: row.taskKey,
  };
}

function privateHiddenLabel(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count === 1
    ? "1 private task hidden"
    : `${count} private tasks hidden`;
}

export function CoworkerDayRoute() {
  const { orgSlug, userId } = useParams({ strict: false }) as {
    orgSlug: string;
    userId: string;
  };
  const { date: searchDate } = useSearch({ strict: false });
  const date = searchDate ?? effectiveDayIso();
  const { data, isLoading } = useGetCoworkerDayQuery({
    slug: orgSlug,
    userId,
    date,
  });
  const { data: membersData } = useListOrgMembersQuery(orgSlug);
  const { data: spacesData } = useListSpacesQuery();
  const { data: me } = useGetMeQuery();
  const band = useViewportBand();
  const name = data?.userName ?? "Co-worker";
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{
    taskId: string;
    title: string;
    fields: ProposalFields;
  } | null>(null);
  const orgSpace = spacesData?.spaces.find(
    (space) => space.kind === "org" && space.slug === orgSlug,
  );
  const orgId = orgSpace?.kind === "org" ? orgSpace.orgId : undefined;
  const tasks = data?.tasks ?? [];
  const selectedRow = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );
  const selectedTask = selectedRow ? stubTask(selectedRow, date) : null;
  const hiddenLabel = privateHiddenLabel(data?.privateHiddenCount ?? 0);

  function openProposal(
    task: CoworkerDayTask,
    field: "title" | "complete" | "bucket",
  ) {
    if (field === "title") {
      setProposal({
        taskId: task.id,
        title: task.title,
        fields: { title: task.title },
      });
      return;
    }
    if (field === "complete") {
      setProposal({
        taskId: task.id,
        title: task.title,
        fields: { completed: true },
      });
      return;
    }
    setProposal({
      taskId: task.id,
      title: task.title,
      fields: {
        placement: {
          scheduledDate: date,
          bucket: "now",
          index: 0,
        },
      },
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-[22px] py-[18px]">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-[18px] font-bold tracking-[-0.02em]">{name}</h1>
          <p className="text-[12.5px] text-muted-foreground">
            {data?.orgName ?? "Organization"}
          </p>
          <CoworkerDayStepper date={date} />
        </div>
        <div className="flex gap-2">
          {orgId && membersData?.members && me?.id && me.id !== userId ? (
            <Button type="button" size="sm" onClick={() => setSendOpen(true)}>
              Send a task
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" asChild>
            <Link to="/o/$orgSlug/coworkers" params={{ orgSlug }}>
              Back to roster
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-[22px] py-[22px]">
          <p className="mb-[18px] text-[13px] text-muted-foreground">
            Read-only. Changes you make are sent to {name.split(" ")[0]} as
            requests.
          </p>
          {isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading day…</p>
          ) : (
            <CoworkerDayBuckets
              tasks={tasks}
              nowCount={data?.nowCount ?? 0}
              nowCap={data?.nowCap ?? 5}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onProposeChange={openProposal}
            />
          )}
          {hiddenLabel ? (
            <p className="mt-[20px] text-[12.5px] text-muted-foreground">
              {hiddenLabel}
            </p>
          ) : null}
        </div>
        {band !== "phone" && selectedTask ? (
          <aside className="hidden w-[380px] shrink-0 border-l border-rule md:block">
            <CommentsTab task={selectedTask} canComment />
          </aside>
        ) : null}
      </div>
      {band === "phone" && selectedTask ? (
        <InspectorSheet
          open={selectedTaskId !== null}
          onClose={() => setSelectedTaskId(null)}
          title={selectedTask.title}
        >
          <CommentsTab task={selectedTask} canComment />
        </InspectorSheet>
      ) : null}
      {orgId && membersData?.members && me?.id ? (
        <SendTaskDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          orgId={orgId}
          orgName={data?.orgName ?? "Organization"}
          members={membersData.members}
          viewerId={me.id}
        />
      ) : null}
      {proposal ? (
        <ProposalComposer
          open
          onOpenChange={(open) => {
            if (!open) {
              setProposal(null);
            }
          }}
          taskId={proposal.taskId}
          taskTitle={proposal.title}
          fields={proposal.fields}
        />
      ) : null}
    </div>
  );
}
