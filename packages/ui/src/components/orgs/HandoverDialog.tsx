import { useState } from "react";
import {
  useGetHandoverPreviewQuery,
  useLeaveOrgMutation,
} from "@tudu/store";
import { FormBusy } from "@/components/forms/FormBusy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mutationResult, notifyAction } from "@/lib/notifyAction";

export type HandoverDialogProps = {
  slug: string;
  userId: string;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
};

export function HandoverDialog({
  slug,
  userId,
  title,
  description,
  open,
  onOpenChange,
  onComplete,
}: HandoverDialogProps) {
  const { data: preview } = useGetHandoverPreviewQuery(
    { slug, userId },
    { skip: !open },
  );
  const [leaveOrg, leaveState] = useLeaveOrgMutation();
  const [handoverTo, setHandoverTo] = useState<string>("");

  const needsHandover = (preview?.openTaskCount ?? 0) > 0;

  async function handleConfirm() {
    try {
      await notifyAction(
        () =>
          mutationResult(
            leaveOrg({
              slug,
              handoverTo: needsHandover ? handoverTo : undefined,
            }),
          ),
        { success: "You left the organization", error: "Could not leave" },
      );
      onOpenChange(false);
      onComplete?.();
    } catch {
      // Toast already shown.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {needsHandover ? (
          <FormBusy busy={leaveState.isLoading} className="flex flex-col gap-3">
            <p className="text-[13px] text-muted-foreground">
              {preview?.openTaskCount} open tasks need a new owner before you can
              leave.
            </p>
            <Select value={handoverTo} onValueChange={setHandoverTo}>
              <SelectTrigger aria-label="Hand tasks to">
                <SelectValue placeholder="Hand tasks to..." />
              </SelectTrigger>
              <SelectContent>
                {(preview?.members ?? []).map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name ?? member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormBusy>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            disabled={
              leaveState.isLoading || (needsHandover && !handoverTo)
            }
            onClick={() => void handleConfirm()}
          >
            {leaveState.isLoading ? "Leaving..." : "Confirm"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
