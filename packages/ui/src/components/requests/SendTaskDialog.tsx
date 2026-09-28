import { useState } from "react";
import type { OrgMemberSummary } from "@tudu/shared";
import { useRequestSendMutation } from "@tudu/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type SendTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  members: OrgMemberSummary[];
  viewerId: string;
};

export function SendTaskDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  members,
  viewerId,
}: SendTaskDialogProps) {
  const [send] = useRequestSendMutation();
  const [toUserId, setToUserId] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const choices = members.filter((member) => member.userId !== viewerId);

  async function submit() {
    if (!toUserId || !title.trim()) {
      return;
    }
    setBusy(true);
    try {
      await notifyAction(
        () =>
          mutationResult(
            send({
              orgId,
              toUserId,
              title: title.trim(),
              description: null,
              message: message.trim() || null,
            }),
          ),
        { success: "Request sent", error: "Could not send request" },
      );
      onOpenChange(false);
      setTitle("");
      setMessage("");
      setToUserId("");
      setConfirmPrivate(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a task in {orgName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
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
          <label className="flex flex-col gap-1 text-[12.5px]">
            Title
            <input
              className="border border-rule bg-transparent px-2 py-2"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px]">
            Message (optional)
            <textarea
              className="min-h-[80px] border border-rule bg-transparent px-2 py-2"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          {confirmPrivate ? (
            <p className="text-[12.5px] text-muted-foreground">
              Sending makes this task visible to everyone in {orgName}.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={busy} disabled={!toUserId || !title.trim()} onClick={() => void submit()}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
