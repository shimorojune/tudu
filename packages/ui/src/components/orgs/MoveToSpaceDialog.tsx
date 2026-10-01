import { useEffect, useMemo, useState } from "react";
import { SPACE_COLOR_HEX, type SpaceColor } from "@tudu/shared";
import {
  useListOrgMembersQuery,
  useListSpacesQuery,
  useMoveTaskToSpaceMutation,
} from "@tudu/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatCountedNoun } from "@/lib/formatCountedNoun";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type MoveToSpaceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
};

export function MoveToSpaceDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
}: MoveToSpaceDialogProps) {
  const { data: spacesData } = useListSpacesQuery();
  const orgSpaces =
    spacesData?.spaces.filter((space) => space.kind === "org") ?? [];
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    orgSpaces[0]?.orgId ?? null,
  );
  useEffect(() => {
    if (!selectedOrgId && orgSpaces[0]?.orgId) {
      setSelectedOrgId(orgSpaces[0].orgId);
    }
  }, [orgSpaces, selectedOrgId]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [moveTask, { isLoading }] = useMoveTaskToSpaceMutation();

  const selected = orgSpaces.find((space) => space.orgId === selectedOrgId);
  const slug = selected?.slug ?? "";
  const { data: membersData } = useListOrgMembersQuery(slug, {
    skip: !slug || !open,
  });
  const memberCount = membersData?.members?.length ?? 0;

  const coworkerPhrase = useMemo(() => {
    const label = formatCountedNoun(memberCount, "co-worker");
    return `${label} will be able to read this task`;
  }, [memberCount]);

  async function handleMove() {
    if (!selectedOrgId) {
      return;
    }
    await notifyAction(
      () =>
        mutationResult(
          moveTask({
            taskId,
            orgId: selectedOrgId,
            projectId: null,
            isPrivate,
          }),
        ),
      {
        success: `Moved to ${selected?.name ?? "organization"}`,
        error: "Could not move the task",
      },
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[470px] gap-0 p-0">
        <DialogHeader className="gap-[5px] border-b border-rule px-5 py-[18px] pb-[14px]">
          <DialogTitle className="text-[15.5px] font-bold tracking-[-0.01em]">
            Move to a space
          </DialogTitle>
          <p className="text-[12.5px] text-muted-foreground line-clamp-2">
            {taskTitle}
          </p>
          <p className="text-[12px] text-faint">
            Personal tasks can move to an organization once.
          </p>
        </DialogHeader>
        <div className="px-5 pt-[14px] pb-[6px] text-[10px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Current space
        </div>
        <div className="flex items-center gap-[11px] border-b border-hair bg-tint px-5 py-3">
          <span className="size-[14px] border-[1.5px] border-rule bg-card" />
          <span className="text-[13.5px] font-semibold">Personal</span>
          <span className="ml-auto text-[11.5px] text-faint">where it is now</span>
        </div>
        <div className="px-5 pt-[14px] pb-[6px] text-[10px] font-extrabold uppercase tracking-[0.14em] text-faint">
          Move to
        </div>
        <div className="flex flex-col border-b border-hair">
          {orgSpaces.map((space) => {
            const active = space.orgId === selectedOrgId;
            const hex = space.color
              ? SPACE_COLOR_HEX[space.color as SpaceColor]
              : "var(--foreground)";
            return (
              <button
                key={space.orgId ?? space.slug}
                type="button"
                className="flex items-center gap-[11px] border-b border-hair px-5 py-3 text-left last:border-b-0"
                style={
                  active
                    ? { boxShadow: "inset 2px 0 0 var(--foreground)" }
                    : undefined
                }
                onClick={() => setSelectedOrgId(space.orgId ?? null)}
              >
                <span
                  className="size-[14px] flex-none"
                  style={{ backgroundColor: hex }}
                />
                <span
                  className={
                    active ? "text-[13.5px] font-semibold" : "text-[13.5px]"
                  }
                >
                  {space.name}
                </span>
              </button>
            );
          })}
        </div>
        {selected ? (
          <div className="border-b border-hair bg-background px-5 py-[14px]">
            <p className="text-[12.5px] leading-[1.55] text-muted-foreground">
              In {selected.name},{" "}
              <span className="font-semibold text-foreground">
                {coworkerPhrase}
              </span>
              , and anyone there can propose edits to it. Its comments and history
              move with it.
            </p>
            <p className="mt-[10px] text-[12px] leading-[1.55] text-faint">
              One-way: it cannot come back to Personal.
            </p>
          </div>
        ) : null}
        <div className="flex items-center gap-3 px-5 py-3">
          <Switch
            id="move-space-private"
            checked={isPrivate}
            onCheckedChange={setIsPrivate}
          />
          <Label htmlFor="move-space-private" className="text-[13px]">
            Keep private in the organization
          </Label>
        </div>
        <DialogFooter className="gap-3 px-5 py-[13px] sm:justify-start">
          <Button
            type="button"
            disabled={!selectedOrgId || isLoading}
            onClick={() => void handleMove()}
          >
            {isLoading
              ? "Moving..."
              : `Move to ${selected?.name ?? "organization"}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
