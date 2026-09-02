import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { AvatarPayload } from "@/lib/types";
import { WizardAvatar } from "@/components/WizardAvatar";
import { Button } from "@/components/ui/button";

interface MochiAvatarProps {
  payload: AvatarPayload | null;
  alerting: boolean;
}

export function MochiAvatar({ payload, alerting }: MochiAvatarProps) {
  if (!payload) return null;

  return (
    <div className="flex flex-col items-end gap-1 p-2">
      <div className="max-w-[148px] rounded-2xl rounded-br-sm border bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
        <p className="font-medium leading-snug">{payload.message}</p>
        <div className="mt-2 flex justify-end gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2 text-xs"
            onClick={() => void api.showMainWindow()}
          >
            Open
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void api.hideAvatar()}
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <button
        type="button"
        className="wizard-avatar-btn"
        onClick={() => void api.showMainWindow()}
        aria-label="Open Tudu"
      >
        <WizardAvatar alerting={alerting} />
      </button>
    </div>
  );
}
