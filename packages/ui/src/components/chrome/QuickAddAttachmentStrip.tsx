import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StagedQuickAddFile } from "@/hooks/usePendingTaskAttachments";

const VISIBLE_THUMBNAIL_COUNT = 3;

export type QuickAddAttachmentStripProps = {
  stagedFiles: StagedQuickAddFile[];
  disabled?: boolean;
  onAttachClick: () => void;
  onRemove: (blobUrl: string) => void;
};

export function QuickAddAttachmentStrip({
  stagedFiles,
  disabled,
  onAttachClick,
  onRemove,
}: QuickAddAttachmentStripProps) {
  const visible = stagedFiles.slice(0, VISIBLE_THUMBNAIL_COUNT);
  const overflow = stagedFiles.length - visible.length;

  return (
    <>
      {visible.length > 0 ? (
        <span className="mx-[3px] h-[20px] w-px bg-hair" aria-hidden />
      ) : null}
      {visible.map((entry) => (
        <span key={entry.blobUrl} className="relative flex shrink-0">
          {entry.file.type.startsWith("image/") ? (
            <img
              src={entry.previewUrl}
              alt=""
              className="size-[26px] border border-rule object-cover"
            />
          ) : (
            <span
              className="flex size-[26px] items-center justify-center border border-rule bg-background px-[4px] text-[9px] font-mono text-muted-foreground"
              title={entry.file.name}
            >
              file
            </span>
          )}
          <button
            type="button"
            aria-label={`Remove ${entry.file.name}`}
            disabled={disabled}
            className="absolute -right-[5px] -top-[5px] grid size-[14px] place-items-center bg-foreground text-[10px] leading-none text-card"
            onClick={() => onRemove(entry.blobUrl)}
          >
            <X className="size-[9px]" strokeWidth={2.5} aria-hidden />
          </button>
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="flex h-[26px] shrink-0 items-center border border-rule px-[7px] text-[11.5px] font-bold text-foreground"
        >
          +{overflow}
        </span>
      ) : null}
      <button
        type="button"
        title="Attach images or files, Cmd+U"
        aria-label="Attach images or files"
        disabled={disabled}
        className={cn(
          "inline-flex shrink-0 items-center border border-rule px-[8px] py-[5px] text-muted-foreground hover:text-foreground disabled:opacity-40",
        )}
        onClick={onAttachClick}
      >
        <Paperclip className="size-[11px]" strokeWidth={2} aria-hidden />
      </button>
    </>
  );
}
