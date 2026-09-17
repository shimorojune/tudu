import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bucket } from "@tudu/shared";
import { DEFAULT_NOW_SOFT_CAP } from "@tudu/shared";
import { todayIso } from "@tudu/store";
import type { TaskDescriptionUploadFn } from "@/components/editor/taskDescriptionAttachments";
import { rejectOversizeFile } from "@/components/editor/taskDescriptionAttachments";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { bucketLabel } from "@/lib/buckets";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import { SubtaskComposerList } from "@/components/tasks/SubtaskComposer";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { FormBusy } from "@/components/forms/FormBusy";
import { Button } from "@/components/ui/button";
import { clearPendingAttachmentBlobUrls } from "@/lib/finalizeNewTaskDescriptionAttachments";
export type { NewTaskDayChoice } from "@/components/tasks/TaskScheduleFields";
import type { NewTaskDayChoice } from "@/components/tasks/TaskScheduleFields";
import {
  resolveScheduledDate,
  TaskScheduleFields,
} from "@/components/tasks/TaskScheduleFields";

export type NewTaskSubmitArgs = {
  title: string;
  description: string | null;
  bucket: Bucket;
  scheduledDate: string | null;
  subtaskTitles: string[];
  projectId: string | null;
  pendingAttachments: Map<string, File>;
};

export type NewTaskDialogProps = {
  open: boolean;
  initialBucket: Bucket;
  initialDate: string;
  initialTitle?: string;
  initialDescription?: string;
  defaultDayChoice?: NewTaskDayChoice;
  nowCount: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (args: NewTaskSubmitArgs) => Promise<void>;
};

function bucketSubmitLabel(bucket: Bucket, isToday: boolean): string {
  const label = bucketLabel(bucket, isToday);
  return `Add to ${label}`;
}

export function NewTaskDialog({
  open,
  initialBucket,
  initialDate,
  initialTitle = "",
  initialDescription = "",
  defaultDayChoice,
  nowCount,
  onOpenChange,
  onSubmit,
}: NewTaskDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<Map<string, File>>(new Map());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bucket, setBucket] = useState<Bucket>(initialBucket);
  const [dayChoice, setDayChoice] = useState<NewTaskDayChoice>("today");
  const [pickedDate, setPickedDate] = useState(initialDate);
  const [subtasks, setSubtasks] = useState<{ id: string; title: string }[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = todayIso();

  const stagingUpload = useCallback<TaskDescriptionUploadFn>(async (file) => {
    if (rejectOversizeFile(file)) {
      throw new Error("File too large");
    }
    const blobUrl = URL.createObjectURL(file);
    pendingAttachmentsRef.current.set(blobUrl, file);
    return {
      contentUrl: blobUrl,
      mimeType: file.type,
      fileName: file.name,
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    clearPendingAttachmentBlobUrls(pendingAttachmentsRef.current);
    setTitle(initialTitle);
    setDescription(initialDescription);
    setBucket(initialBucket);
    setDayChoice(
      defaultDayChoice ??
        (initialDate === today ? "today" : "pick"),
    );
    setPickedDate(initialDate);
    setSubtasks([]);
    setProjectId(null);
    setSubmitting(false);
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }, [defaultDayChoice, initialBucket, initialDate, initialDescription, initialTitle, open, today]);

  const scheduledDate = useMemo(
    () => resolveScheduledDate(dayChoice, pickedDate, today),
    [dayChoice, pickedDate, today],
  );

  const targetIsToday = scheduledDate === today;
  const isUnscheduled = dayChoice === "unscheduled";

  const projectedNowCount =
    bucket === "now" && targetIsToday ? nowCount + 1 : nowCount;

  const showNowCap = bucket === "now" && targetIsToday;

  const submitLabel = isUnscheduled
    ? "Add to Unscheduled"
    : bucketSubmitLabel(bucket, targetIsToday);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || submitting) {
      return;
    }
    const trimmedDescription = description.trim();
    const pendingAttachments = new Map(pendingAttachmentsRef.current);
    setSubmitting(true);
    try {
      await onSubmit({
        title: trimmed,
        description: trimmedDescription.length > 0 ? trimmedDescription : null,
        bucket,
        scheduledDate,
        subtaskTitles: subtasks.map((subtask) => subtask.title),
        projectId,
        pendingAttachments,
      });
      clearPendingAttachmentBlobUrls(pendingAttachmentsRef.current);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-dvh max-w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 border-rule bg-card p-0 sm:max-w-full md:max-h-[85vh] md:max-w-[660px]"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter"
          ) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
      >
        <div className="flex items-center justify-between border-b border-rule px-[24px] py-[16px]">
          <DialogTitle className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            New task
          </DialogTitle>
          <span className="text-[12px] text-muted-foreground">Esc</span>
        </div>

        <FormBusy busy={submitting} className="min-h-0 space-y-[20px] overflow-y-auto px-[24px] py-[20px]">
          <input
            ref={titleRef}
            type="text"
            value={title}
            placeholder="What needs doing?"
            className="w-full border-b border-rule bg-transparent pb-[10px] text-[18px] font-semibold outline-none placeholder:text-faint"
            onChange={(event) => setTitle(event.target.value)}
          />

          <div className="space-y-[8px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Description
            </div>
            <RichTextEditor
              mode="html"
              value={description}
              placeholder="Add a description..."
              aria-label="Task description"
              className="text-muted-foreground focus-within:text-foreground"
              taskAttachments={{ upload: stagingUpload }}
              onChange={setDescription}
            />
          </div>

          <TaskScheduleFields
            dayChoice={dayChoice}
            bucket={bucket}
            pickedDate={pickedDate}
            nowCount={nowCount}
            onDayChoiceChange={setDayChoice}
            onBucketChange={setBucket}
            onPickedDateChange={setPickedDate}
          />

          <div className="space-y-[8px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Project
            </div>
            <ProjectPicker value={projectId} onChange={setProjectId} />
          </div>

          <div className="space-y-[8px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Deadline
            </div>
            <span className="text-[13px] text-muted-foreground">No deadline</span>
          </div>

          <div className="space-y-[8px]">
            <div className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
              Subtasks
            </div>
            <SubtaskComposerList
              autoFocus={false}
              committed={subtasks}
              onAdd={(subtaskTitle) => {
                setSubtasks((current) => [
                  ...current,
                  { id: crypto.randomUUID(), title: subtaskTitle },
                ]);
              }}
              onEdit={(id, title) => {
                setSubtasks((current) =>
                  current.map((subtask) =>
                    subtask.id === id ? { ...subtask, title } : subtask,
                  ),
                );
              }}
              onRemove={(id) => {
                setSubtasks((current) =>
                  current.filter((subtask) => subtask.id !== id),
                );
              }}
            />
          </div>
        </FormBusy>

        <div className="flex items-center gap-[16px] border-t border-rule bg-background px-[24px] py-[15px]">
          {showNowCap ? (
            <span className="text-[12.5px] text-muted-foreground">
              Now will hold{" "}
              <span className="font-bold tabular-nums text-foreground">
                {projectedNowCount} of {DEFAULT_NOW_SOFT_CAP}
              </span>
            </span>
          ) : (
            <span className="text-[12.5px] text-muted-foreground" />
          )}
          <button
            type="button"
            className="ml-auto border border-rule px-[13px] py-[7px] text-[12.5px] text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <Button
            type="button"
            loading={submitting}
            disabled={!title.trim()}
            className="inline-flex h-auto items-center gap-[8px] bg-primary px-[15px] py-[8px] text-[13px] font-bold"
            onClick={() => {
              void handleSubmit();
            }}
          >
            {submitLabel}
            <span className="text-[11px] font-normal text-primary-foreground/70">
              Cmd+Enter
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
