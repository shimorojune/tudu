import { useState } from "react";
import type { OrgMemberSummary } from "@tudu/shared";
import { useRequestReassignMutation } from "@tudu/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type ReassignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  orgName: string;
  isPrivate: boolean;
  members: OrgMemberSummary[];
  viewerId: string;
};

export function ReassignDialog({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  orgName,
  isPrivate,
  members,
  viewerId,
}: ReassignDialogProps) {
  const [reassign] = useRequestReassignMutation();
  const [toUserId, setToUserId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = members.filter((member) => member.userId !== viewerId);

  async function submit() {
    if (!toUserId) {
      return;
    }
    setBusy(true);
    try {
      await notifyAction(
        () =>
          mutationResult(
            reassign({ taskId, toUserId, message: message.trim() || null }),
          ),
        { success: "Reassign request sent", error: "Could not reassign" },
      );
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Give “{taskTitle}” to a co-worker</DialogTitle>
        </DialogHeader>
        {isPrivate ? (
          <p className="text-[12.5px] text-muted-foreground">
            Reassigning makes this task visible to everyone in {orgName}.
          </p>
        ) : null}
        <label className="flex flex-col gap-1 text-[12.5px]">
          Message (optional)
          <textarea
            className="min-h-[60px] border border-rule bg-transparent px-2 py-2"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px]">
          Co-worker
          <select
            className="border border-rule bg-transparent px-2 py-2"
            value={toUserId}
            onChange={(event) => setToUserId(event.target.value)}
          >
            <option value="">Select…</option>
            {choices.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name ?? member.email}
              </option>
            ))}
          </select>
        </label>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={busy} disabled={!toUserId} onClick={() => void submit()}>
            Send reassign request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
