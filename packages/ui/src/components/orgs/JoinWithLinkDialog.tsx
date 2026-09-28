import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { joinCodeFromInput } from "@/lib/spaceNav";

export type JoinWithLinkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JoinWithLinkDialog({
  open,
  onOpenChange,
}: JoinWithLinkDialogProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");

  function handleContinue() {
    const code = joinCodeFromInput(value);
    if (!code) {
      return;
    }
    onOpenChange(false);
    setValue("");
    void navigate({ to: "/join/$code", params: { code } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Join with a link</DialogTitle>
          <DialogDescription>
            Paste the join link or code from your co-worker.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="tudu://join/your-code or join link"
          className="font-mono text-[13px]"
        />
        <DialogFooter>
          <Button type="button" disabled={!value.trim()} onClick={handleContinue}>
            Continue
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
