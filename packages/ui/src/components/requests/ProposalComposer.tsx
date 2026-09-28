import { useState } from "react";
import type { ProposalFields, RequestProposeBody } from "@tudu/shared";
import { useRequestProposeMutation } from "@tudu/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type ProposalComposerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  fields: ProposalFields;
};

export function ProposalComposer({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  fields,
}: ProposalComposerProps) {
  const [propose] = useRequestProposeMutation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await notifyAction(
        () =>
          mutationResult(
            propose({
              taskId,
              fields: fields as RequestProposeBody["fields"],
              message: message.trim() || null,
            }),
          ),
        { success: "Proposal sent", error: "Could not send proposal" },
      );
      onOpenChange(false);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose a change to “{taskTitle}”</DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] text-muted-foreground">
          Your co-worker will see this in Requests before anything changes.
        </p>
        <label className="flex flex-col gap-1 text-[12.5px]">
          Message (optional)
          <textarea
            className="min-h-[80px] border border-rule bg-transparent px-2 py-2"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={busy} onClick={() => void submit()}>
            Send proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
