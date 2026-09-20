import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  stripProjectPhraseFromTitle,
  validateStartBeforeDeadline,
  type Bucket,
} from "@tudu/shared";
import { X } from "lucide-react";
import {
  todayIso,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
} from "@tudu/store";
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
import { renderQuickAddHighlightedTitle } from "@/lib/quickAddHighlight";
import { resetQuickAddWindowHeight } from "@/lib/quickAddWindowResize";
import {
  type NewTaskDayChoice,
  resolveScheduledDate,
} from "@/components/tasks/TaskScheduleFields";
import { cn } from "@/lib/utils";

const EXIT_MS = 200;
const HIDE_REQUEST_GRACE_MS = 500;

/** Content width; Tauri window adds 8px outer padding (see quick_add.rs). */
export const QUICK_ADD_PANEL_WIDTH_PX = 582;

export type QuickAddCloseReason = {
  afterSave?: boolean;
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
  const titleMirrorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const exitFinishedRef = useRef(false);
  const closeAfterSaveRef = useRef(false);
  const { resolved } = useTheme();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [title, setTitle] = useState("");
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
  const [createTask] = useCreateTaskMutation();
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

  const resetForm = useCallback(() => {
    setTitle("");
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
  }, [today]);

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

  const syncTitleScroll = useCallback(() => {
    const input = titleRef.current;
    const mirror = titleMirrorRef.current;
    if (!input || !mirror) {
      return;
    }
    mirror.scrollLeft = input.scrollLeft;
  }, []);

  useEffect(() => {
    syncTitleScroll();
  }, [title, parse, syncTitleScroll]);

  async function handleSubmit() {
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

    if (validateStartBeforeDeadline(startDate || null, deadline)) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await createTask(
        createTaskBody({
          title: saveTitle,
          description: null,
          scheduledDate,
          bucket: scheduledDate === null ? null : bucket,
          startDate: startDate || null,
          deadline,
          projectId,
        }),
      ).unwrap();

      const { emit } = await import("@tauri-apps/api/event");
      await emit("task-created", { task: result.task });
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
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
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

  return shell(
    <div
      className="flex w-[582px] flex-col overflow-visible border border-black/35 bg-card shadow-none"
      aria-busy={submitting || undefined}
    >
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
          <div className="grid min-w-0 w-full flex-1 grid-cols-[minmax(0,1fr)] [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-w-0">
            <div
              ref={titleMirrorRef}
              aria-hidden
              className={cn(
                quickAddTitleTypography,
                "pointer-events-none flex items-center overflow-x-hidden overflow-y-hidden whitespace-pre text-foreground",
              )}
            >
              {renderQuickAddHighlightedTitle(title, parse?.spans ?? [])}
              {!title ? (
                <span className="text-muted-foreground">What needs doing?</span>
              ) : null}
            </div>
            <input
              ref={titleRef}
              type="text"
              value={title}
              disabled={submitting}
              placeholder="What needs doing?"
              className={cn(
                quickAddTitleTypography,
                "text-transparent caret-primary placeholder:text-transparent disabled:opacity-70",
              )}
              onChange={(event) => {
                setTitle(event.target.value);
                window.requestAnimationFrame(syncTitleScroll);
              }}
              onScroll={syncTitleScroll}
            />
          </div>
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
      />

      <div
        className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] border-t border-hair bg-background px-[18px] py-[11px] text-[11.5px]"
      >
        {submitting ? (
          <span className="flex items-center gap-[6px] text-muted-foreground">
            <Spinner className="size-3" aria-hidden />
            Saving task…
          </span>
        ) : (
          <span className="text-muted-foreground">
            Lands in{" "}
            <span className="font-bold text-foreground">
              {landsIn.dayPart}
              {landsIn.bucketPart ? ` · ${landsIn.bucketPart}` : ""}
            </span>
            {landsIn.jiraPart ? (
              <span>, linked to {landsIn.jiraPart}</span>
            ) : null}
          </span>
        )}
        <span className="ml-auto font-mono text-muted-foreground">
          Enter save · Esc close
        </span>
      </div>
    </div>,
  );
}
