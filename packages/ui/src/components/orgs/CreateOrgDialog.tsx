import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ProjectColor } from "@tudu/shared";
import { useCreateOrgMutation } from "@tudu/store";
import { ColourPicker } from "@/components/orgs/ColourPicker";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { notifyAction, mutationResult } from "@/lib/notifyAction";

export type CreateOrgDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const navigate = useNavigate();
  const [createOrg, createState] = useCreateOrgMutation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>("vermilion");
  const [joinLinkEnabled, setJoinLinkEnabled] = useState(false);

  async function handleCreate() {
    try {
      const created = (await notifyAction(
        () =>
          mutationResult(
            createOrg({
              name,
              color,
              joinLinkEnabled,
            }),
          ),
        {
          success: "Organization created",
          error: "Could not create organization",
        },
      )) as { org: { slug: string } };
      onOpenChange(false);
      setName("");
      void navigate({
        to: "/o/$orgSlug",
        params: { orgSlug: created.org.slug },
      });
    } catch {
      // Toast already shown.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 p-0">
        <DialogHeader className="border-b border-rule px-[22px] py-[20px]">
          <DialogTitle className="text-[17px] font-bold tracking-[-0.01em]">
            New organization
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            A shared space. Your personal tasks stay where they are.
          </DialogDescription>
        </DialogHeader>
        <FormBusy busy={createState.isLoading} className="px-[22px] py-[20px]">
          <div className="flex flex-col gap-[18px]">
            <label className="flex flex-col gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
                Name
              </span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Organization name"
                className="text-[13.5px]"
              />
            </label>
            <ColourPicker value={color} onChange={setColor} label="Badge" />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[14px] gap-y-1 border-t border-hair pt-4">
              <div className="flex flex-col gap-1">
                <span className="text-[14px]">Anyone with the link can join</span>
                <span className="text-[12px] text-muted-foreground">
                  Off means invite by email only
                </span>
              </div>
              <Switch
                checked={joinLinkEnabled}
                onCheckedChange={setJoinLinkEnabled}
                aria-label="Anyone with the link can join"
              />
            </div>
          </div>
        </FormBusy>
        <DialogFooter className="border-t border-rule px-[22px] py-[14px] sm:justify-start">
          <Button
            type="button"
            disabled={createState.isLoading || !name.trim()}
            onClick={() => void handleCreate()}
          >
            {createState.isLoading ? "Creating..." : "Create organization"}
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
