import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  NOW_CAP_EXCEEDED_MESSAGE,
  stripProjectPhraseFromTitle,
  validateStartBeforeDeadline,
  type Bucket,
} from "@tudu/shared";
import { X } from "lucide-react";
import {
  todayIso,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
  useUpdateTaskMutation,
  useUploadTaskAttachmentMutation,
} from "@tudu/store";
import { useProjectSpaceScope } from "@/hooks/useProjectSpaceScope";
import { TuduMark } from "@/components/TuduLogo";
import {
  formatQuickAddLandsIn,
  QuickAddCaptureChips,
} from "@/components/chrome/QuickAddCaptureChips";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTheme } from "@/hooks/useTheme";
import {
  startQuickAddWindowDrag,
  useQuickAddWindowDrag,
} from "@/hooks/useQuickAddWindowDrag";
import { useTaskFieldSuggest } from "@/hooks/useTaskFieldSuggest";
import { useTaskTitleNaturalLanguage } from "@/hooks/useTaskTitleNaturalLanguage";
import { authClient } from "@/lib/authClient";
import { createTaskBody } from "@/lib/createTask";
import { openNowCount } from "@/lib/nowCount";
import { canAddNewTaskToNow } from "@/lib/nowCapGuard";
import { TaskTitleNaturalLanguageField } from "@/components/tasks/TaskTitleNaturalLanguageField";
import { resetQuickAddWindowHeight } from "@/lib/quickAddWindowResize";
import {
  type NewTaskDayChoice,
  resolveScheduledDate,
} from "@/components/tasks/TaskScheduleFields";
import { cn } from "@/lib/utils";
import { patchTaskDescriptionIfAttachmentsChanged } from "@/lib/afterCreateTaskDescription";
import { QuickAddAttachmentStrip } from "@/components/chrome/QuickAddAttachmentStrip";
import {
  stageFilesFromList,
  usePendingTaskAttachments,
} from "@/hooks/usePendingTaskAttachments";
import {
  plainQuickAddNoteToDescriptionHtml,
  quickAddNoteAtLineCap,
  quickAddNoteLineCount,
} from "@/lib/quickAddNote";

const EXIT_MS = 200;
const HIDE_REQUEST_GRACE_MS = 500;

/** Content width; Tauri window adds 8px outer padding (see quick_add.rs). */
export const QUICK_ADD_PANEL_WIDTH_PX = 582;

export type QuickAddCloseReason = {
  afterSave?: boolean;
};

export type QuickAddTaskCreatedPayload = {
  task: { id: string };
  open?: boolean;
};

export type QuickAddTaskPaneProps = {
  onRequestSignIn: () => void;
  onClose: (reason?: QuickAddCloseReason) => void;
};

type AutoSource = "auto" | "manual";

function QuickAddDragDots() {
  return (
    <span
      className="grid shrink-0 grid-cols-2 gap-[3px]"
      aria-hidden
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <span
          key={index}
          className="size-[3px] bg-ghost"
        />
      ))}
    </span>
  );
}

export function QuickAddTaskPane({
  onRequestSignIn,
  onClose,
}: QuickAddTaskPaneProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const descriptionHtmlRef = useRef<string | null>(null);
  const openedAtRef = useRef(0);
  const exitFinishedRef = useRef(false);
  const closeAfterSaveRef = useRef(false);
  const { resolved } = useTheme();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [noteFocused, setNoteFocused] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [pendingDropCount, setPendingDropCount] = useState(0);
  const [bucket, setBucket] = useState<Bucket>("next");
  const [dayChoice, setDayChoice] = useState<NewTaskDayChoice>("today");
  const [pickedDate, setPickedDate] = useState(() => todayIso());
  const [startDate, setStartDate] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [jevProjectName, setJevProjectName] = useState<string | null>(null);
  const [scheduleSource, setScheduleSource] = useState<AutoSource>("auto");
  const [bucketSource, setBucketSource] = useState<AutoSource>("auto");
  const [projectSource, setProjectSource] = useState<AutoSource>("auto");
  const [startSource, setStartSource] = useState<AutoSource>("auto");
  const [deadlineSource, setDeadlineSource] = useState<AutoSource>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [jevSuggesting, setJevSuggesting] = useState(false);
  const [enterGeneration, setEnterGeneration] = useState(0);
  const [exiting, setExiting] = useState(false);

  const today = todayIso();
  const spaceScope = useProjectSpaceScope();
  const [createTask] = useCreateTaskMutation();
  const [uploadTaskAttachment] = useUploadTaskAttachmentMutation();
  const [updateTask] = useUpdateTaskMutation();
  const {
    pendingAttachmentsRef,
    stagedFiles,
    stageFile,
    removeFile,
    clear: clearAttachments,
  } = usePendingTaskAttachments();
  useQuickAddWindowDrag();
  const parse = useTaskTitleNaturalLanguage(title, today);
  const scheduledDate = resolveScheduledDate(dayChoice, pickedDate, today);
  const { data: targetDayTasks } = useGetTasksForDayQuery(
    scheduledDate ?? today,
    { skip: scheduledDate === null },
  );
  const nowCount = openNowCount(targetDayTasks?.tasks ?? []);

  useTaskFieldSuggest({
    title,
    parse,
    today,
    scheduledDate,
    nowCount,
    scheduleSource,
    bucketSource,
    projectSource,
    startSource,
    deadlineSource,
    onProjectId: (id, name) => {
      setProjectId(id);
      setJevProjectName(name);
    },
    onBucket: setBucket,
    onDayChoice: setDayChoice,
    onPickedDate: setPickedDate,
    onStartDate: setStartDate,
    onDeadline: setDeadline,
    onJevSuggesting: setJevSuggesting,
  });

  const syncDescriptionFromNote = useCallback((nextNote: string) => {
    descriptionHtmlRef.current = plainQuickAddNoteToDescriptionHtml(nextNote);
  }, []);

  const resetForm = useCallback(() => {
    setTitle("");
    setNote("");
    setNoteFocused(false);
    setDragDepth(0);
    setPendingDropCount(0);
    descriptionHtmlRef.current = null;
    clearAttachments();
    setBucket("next");
    setDayChoice("today");
    setPickedDate(today);
    setStartDate("");
    setDeadline(null);
    setProjectId(null);
    setJevProjectName(null);
    setScheduleSource("auto");
    setBucketSource("auto");
    setProjectSource("auto");
    setStartSource("auto");
    setDeadlineSource("auto");
    setSubmitting(false);
    setJevSuggesting(false);
    void resetQuickAddWindowHeight();
  }, [today, clearAttachments]);

  const beginOpen = useCallback(() => {
    exitFinishedRef.current = false;
    closeAfterSaveRef.current = false;
    setExiting(false);
    resetForm();
    setEnterGeneration((value) => value + 1);
    openedAtRef.current = Date.now();
    window.requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
  }, [resetForm]);

  const closeWithAnimation = useCallback(() => {
    if (exiting) {
      return;
    }
    setExiting(true);
  }, [exiting]);

  const finishClose = useCallback(() => {
    if (exitFinishedRef.current) {
      return;
    }
    exitFinishedRef.current = true;
    setExiting(false);
    onClose(
      closeAfterSaveRef.current ? { afterSave: true } : undefined,
    );
    closeAfterSaveRef.current = false;
  }, [onClose]);

  useEffect(() => {
    if (!exiting) {
      return;
    }
    const timeoutId = window.setTimeout(finishClose, EXIT_MS + 80);
    return () => window.clearTimeout(timeoutId);
  }, [exiting, finishClose]);

  useEffect(() => {
    let unlistenShown: (() => void) | undefined;
    let unlistenHide: (() => void) | undefined;

    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow())
      .then((window) => {
        void window.listen("quick-add:shown", () => {
          beginOpen();
        }).then((unlistenFn) => {
          unlistenShown = unlistenFn;
        });

        void window.listen("quick-add:hide-request", () => {
          if (Date.now() - openedAtRef.current < HIDE_REQUEST_GRACE_MS) {
            return;
          }
          closeWithAnimation();
        }).then((unlistenFn) => {
          unlistenHide = unlistenFn;
        });
      })
      .catch(() => {
        beginOpen();
      });

    return () => {
      unlistenShown?.();
      unlistenHide?.();
    };
  }, [beginOpen, closeWithAnimation]);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    function onDevOpen() {
      beginOpen();
    }
    window.addEventListener("quick-add:dev-open", onDevOpen);
    return () => window.removeEventListener("quick-add:dev-open", onDevOpen);
  }, [beginOpen]);

  const targetIsToday = scheduledDate === today;
  const scheduleError = validateStartBeforeDeadline(startDate || null, deadline);
  const nowBlocked =
    targetIsToday &&
    bucket === "now" &&
    scheduledDate !== null &&
    !canAddNewTaskToNow({
      today,
      scheduledDate,
      bucket,
      openNowCountOnToday: nowCount,
    });

  async function handleSubmit(openAfterSave = false) {
    const trimmed = title.trim();
    if (!trimmed || submitting || !session) {
      return;
    }

    let saveTitle = parse?.titleForSave.trim() || trimmed;
    if (jevProjectName) {
      saveTitle = stripProjectPhraseFromTitle(saveTitle, jevProjectName);
    }
    saveTitle = saveTitle.trim();
    if (!saveTitle) {
      return;
    }

    if (scheduleError || nowBlocked) {
      return;
    }

    setSubmitting(true);
    try {
      const description = descriptionHtmlRef.current;
      const pendingAttachments = new Map(pendingAttachmentsRef.current);
      const result = await createTask(
        createTaskBody({
          title: saveTitle,
          description,
          scheduledDate,
          bucket: scheduledDate === null ? null : bucket,
          startDate: startDate || null,
          deadline,
          projectId,
          orgId: spaceScope.kind === "org" ? spaceScope.orgId : null,
        }),
      ).unwrap();

      await patchTaskDescriptionIfAttachmentsChanged(
        result.task.id,
        description,
        pendingAttachments,
        (input) => uploadTaskAttachment(input).unwrap(),
        (nextDescription) =>
          updateTask({
            id: result.task.id,
            patch: { description: nextDescription },
          }).unwrap(),
      );

      const { emit } = await import("@tauri-apps/api/event");
      await emit("task-created", {
        task: result.task,
        open: openAfterSave,
      } satisfies QuickAddTaskCreatedPayload);
      closeAfterSaveRef.current = true;
      closeWithAnimation();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeWithAnimation();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      fileInputRef.current?.click();
      return;
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "Enter"
    ) {
      event.preventDefault();
      void handleSubmit(true);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const target = event.target;
      if (target === noteRef.current) {
        return;
      }
      event.preventDefault();
      void handleSubmit(false);
      return;
    }
    if (event.key === "Tab" && event.target === titleRef.current && !event.shiftKey) {
      event.preventDefault();
      setNoteFocused(true);
      window.requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    if (event.key === "Tab" && event.target === noteRef.current && event.shiftKey) {
      event.preventDefault();
      titleRef.current?.focus();
    }
  }

  function handleNoteChange(value: string) {
    const lines = value.split("\n");
    if (lines.length > 3) {
      value = lines.slice(0, 3).join("\n");
    }
    setNote(value);
    syncDescriptionFromNote(value);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    stageFilesFromList(
      files,
      stageFile,
      (next) => {
        descriptionHtmlRef.current = next;
      },
      descriptionHtmlRef.current,
    );
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes("Files")) {
      setDragDepth((value) => value + 1);
      setPendingDropCount(event.dataTransfer.items.length);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragDepth((value) => Math.max(0, value - 1));
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragDepth(0);
    if (!event.dataTransfer.files.length) {
      return;
    }
    stageFilesFromList(
      event.dataTransfer.files,
      stageFile,
      (next) => {
        descriptionHtmlRef.current = next;
      },
      descriptionHtmlRef.current,
    );
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handlePanelAnimationEnd(
    event: React.AnimationEvent<HTMLDivElement>,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (exiting && event.animationName === "quick-add-exit") {
      finishClose();
    }
  }

  function shell(content: ReactNode) {
    return (
      <div
        className="flex max-w-[calc(100vw-24px)] justify-center p-[4px]"
        style={{ width: QUICK_ADD_PANEL_WIDTH_PX + 8 }}
      >
        <div
          ref={panelRef}
          key={enterGeneration}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onAnimationEnd={handlePanelAnimationEnd}
          className={cn(
            "w-full outline-none",
            exiting ? "quick-add-panel-exit" : "quick-add-panel-enter",
          )}
        >
          {content}
        </div>
      </div>
    );
  }

  if (sessionPending) {
    return shell(
      <div className="border border-black/35 bg-card px-[14px] py-[12px] text-[13px] text-muted-foreground shadow-none">
        Loading...
      </div>,
    );
  }

  if (!session) {
    return shell(
      <div className="flex items-center justify-between gap-[12px] border border-black/35 bg-card px-[14px] py-[12px] shadow-none">
        <p className="text-[13px] text-muted-foreground">
          Sign in to add tasks from Quick Add.
        </p>
        <Button
          type="button"
          className="h-auto px-[12px] py-[7px]"
          onClick={() => {
            closeWithAnimation();
            window.setTimeout(() => onRequestSignIn(), EXIT_MS);
          }}
        >
          Open sign in
        </Button>
      </div>,
    );
  }

  const quickAddTitleLineClass = "min-h-[24px] leading-[24px]";
  const quickAddTitleTypography = cn(
    "min-w-0 w-full max-w-full border-0 bg-transparent p-0 text-[21px] tracking-[-0.015em] outline-none",
    quickAddTitleLineClass,
  );

  const jiraKeyMatch = title.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  const jiraKey = jiraKeyMatch?.[1] ?? null;
  const landsIn = formatQuickAddLandsIn({
    dayChoice,
    pickedDate,
    today,
    bucket,
    jiraKey,
  });

  const showNote = noteFocused || note.trim().length > 0;
  const noteAtCap = quickAddNoteAtLineCap(note);
  const imageCount = stagedFiles.length;

  return shell(
    <div
      className="relative flex w-[582px] flex-col overflow-visible border border-black/35 bg-card shadow-none"
      aria-busy={submitting || undefined}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files;
          if (!files) {
            return;
          }
          stageFilesFromList(
            files,
            stageFile,
            (next) => {
              descriptionHtmlRef.current = next;
            },
            descriptionHtmlRef.current,
          );
          event.target.value = "";
        }}
      />
      <div className="flex items-center gap-[13px] px-[14px] py-[17px] pr-[18px]">
        <button
          type="button"
          aria-label="Move Quick Add"
          disabled={submitting}
          className="inline-flex h-[22px] cursor-grab items-center justify-center active:cursor-grabbing disabled:opacity-40"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            void startQuickAddWindowDrag();
          }}
        >
          <QuickAddDragDots />
        </button>
        <TuduMark
          className="size-[22px]"
          onDark={resolved === "dark"}
        />
        <div className="min-w-0 flex flex-1 items-center gap-[7px]">
          <TaskTitleNaturalLanguageField
            inputRef={titleRef}
            value={title}
            parse={parse}
            disabled={submitting}
            placeholder="What needs doing?"
            mirrorClassName={cn(
              quickAddTitleTypography,
              "text-foreground",
            )}
            inputClassName={quickAddTitleTypography}
            onChange={setTitle}
            onKeyDown={(event) => {
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                setNoteFocused(true);
                window.requestAnimationFrame(() => noteRef.current?.focus());
              }
            }}
          />
        </div>
        <button
          type="button"
          aria-label="Close Quick Add"
          disabled={submitting}
          className="inline-flex shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={closeWithAnimation}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {showNote ? (
        <div className="-mt-[8px] px-[18px] pb-[12px] pl-[71px]">
          <textarea
            ref={noteRef}
            value={note}
            rows={Math.min(3, Math.max(1, quickAddNoteLineCount(note)))}
            disabled={submitting}
            placeholder="Add a note"
            aria-label="Quick Add note"
            className={cn(
              "w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.5] text-muted-foreground outline-none",
              noteAtCap && "line-clamp-3",
            )}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            onChange={(event) => handleNoteChange(event.target.value)}
          />
        </div>
      ) : null}

      <QuickAddCaptureChips
        dayChoice={dayChoice}
        bucket={bucket}
        pickedDate={pickedDate}
        today={today}
        nowCount={nowCount}
        projectId={projectId}
        title={title}
        jevSuggesting={jevSuggesting}
        disabled={submitting}
        onDayChoiceChange={(value) => {
          setScheduleSource("manual");
          setDayChoice(value);
        }}
        onPickedDateChange={(value) => {
          setScheduleSource("manual");
          setPickedDate(value);
        }}
        onBucketChange={(value) => {
          setBucketSource("manual");
          setBucket(value);
        }}
        onProjectChange={(value) => {
          setProjectSource("manual");
          setProjectId(value);
          if (!value) {
            setJevProjectName(null);
          }
        }}
        deadline={deadline}
        onDeadlineChange={(value) => {
          setDeadlineSource("manual");
          setDeadline(value);
        }}
        tabNoteHint={!showNote}
        attachmentStrip={
          <QuickAddAttachmentStrip
            stagedFiles={stagedFiles}
            disabled={submitting}
            onAttachClick={openFilePicker}
            onRemove={removeFile}
          />
        }
      />

      {dragDepth > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center gap-[12px] border-2 border-foreground bg-card/90 px-[24px]"
          aria-hidden
        >
          <span className="text-[16px] font-bold">
            Drop to attach {pendingDropCount > 0 ? pendingDropCount : ""} file
            {pendingDropCount === 1 ? "" : "s"}
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            they go with the task
          </span>
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] border-t border-hair bg-background px-[18px] py-[11px] text-[11.5px]"
      >
        {submitting ? (
          <span className="flex items-center gap-[6px] text-muted-foreground">
            <Spinner className="size-3" aria-hidden />
            Saving task…
          </span>
        ) : nowBlocked ? (
          <span className="text-destructive">{NOW_CAP_EXCEEDED_MESSAGE}</span>
        ) : scheduleError ? (
          <span className="text-destructive">{scheduleError}</span>
        ) : noteAtCap ? (
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">
              Three lines is the bar&apos;s limit
            </span>
            <span> · keep going in the task</span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            Lands in{" "}
            <span className="font-bold text-foreground">
              {landsIn.dayPart}
              {landsIn.bucketPart ? ` · ${landsIn.bucketPart}` : ""}
            </span>
            {note.trim() ? <span> · note</span> : null}
            {imageCount > 0 ? (
              <span>
                {" "}
                · {imageCount} image{imageCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {landsIn.jiraPart ? (
              <span>, linked to {landsIn.jiraPart}</span>
            ) : null}
          </span>
        )}
        <span className="ml-auto font-mono text-muted-foreground">
          {noteAtCap ? "Cmd+Enter save and open" : "Enter save · Esc close"}
        </span>
      </div>
    </div>,
  );
}
