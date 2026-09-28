import { useEffect, useState } from "react";
import type { ProjectColor } from "@tudu/shared";
import {
  useGetOrgQuery,
  useUpdateOrgKeyPrefixMutation,
  useUpdateOrgMutation,
} from "@tudu/store";
import { KeyPrefixField } from "@/components/settings/KeyPrefixField";
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
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { mutationResult, notifyAction } from "@/lib/notifyAction";

export type OrgBadgeDialogProps = {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OrgBadgeDialog({
  slug,
  open,
  onOpenChange,
}: OrgBadgeDialogProps) {
  const { data: org } = useGetOrgQuery(slug, { skip: !open });
  const [updateOrg, updateState] = useUpdateOrgMutation();
  const [updateKeyPrefix] = useUpdateOrgKeyPrefixMutation();
  const [color, setColor] = useState<ProjectColor>("vermilion");

  useEffect(() => {
    if (org?.color) {
      setColor(org.color);
    }
  }, [org?.color]);

  async function handleSave() {
    try {
      await notifyAction(
        () => mutationResult(updateOrg({ slug, body: { color } })),
        { success: "Badge updated", error: "Could not update badge" },
      );
      onOpenChange(false);
    } catch {
      // Toast already shown.
    }
  }

  const initial = org?.name?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] gap-0 p-0">
        <DialogHeader className="border-b border-rule px-[22px] py-[20px]">
          <DialogTitle className="text-[17px] font-bold tracking-[-0.01em]">
            {org?.name ?? "Organization"} badge
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Shows in the space switcher, invites, and the admin panel.
          </DialogDescription>
        </DialogHeader>
        <FormBusy busy={updateState.isLoading} className="px-[22px] py-[20px]">
          <div className="flex items-center gap-[14px]">
            <div
              className="grid size-[44px] place-items-center text-[19px] font-extrabold text-primary-foreground"
              style={{ backgroundColor: SPACE_COLOR_HEX[color] }}
            >
              {initial}
            </div>
            <ColourPicker value={color} onChange={setColor} label="Task colour" />
          </div>
          {org ? (
            <div className="mt-[20px] border-t border-hair pt-[20px]">
              <KeyPrefixField
                value={org.keyPrefix}
                locked={org.keyPrefixLocked}
                onSave={async (keyPrefix) => {
                  await updateKeyPrefix({ slug, keyPrefix }).unwrap();
                }}
              />
            </div>
          ) : null}
        </FormBusy>
        <DialogFooter className="border-t border-rule px-[22px] py-[14px] sm:justify-start">
          <Button
            type="button"
            disabled={updateState.isLoading}
            onClick={() => void handleSave()}
          >
            {updateState.isLoading ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
