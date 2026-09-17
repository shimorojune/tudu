import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Bucket } from "@tudu/shared";
import { X } from "lucide-react";
import {
  todayIso,
  useCreateTaskMutation,
  useGetTasksForDayQuery,
} from "@tudu/store";
import { authClient } from "@/lib/authClient";
import { createTaskBody } from "@/lib/createTask";
import { ProjectPicker } from "@/components/projects/ProjectPicker";
import {
  type NewTaskDayChoice,
  resolveScheduledDate,
  TaskScheduleFields,
} from "@/components/tasks/TaskScheduleFields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const EXIT_MS = 200;
const HIDE_REQUEST_GRACE_MS = 500;

/** Content width; Tauri window adds 8px outer padding (see quick_add.rs). */
export const QUICK_ADD_PANEL_WIDTH_PX = 520;

export type QuickAddCloseReason = {
  afterSave?: boolean;
};

export type QuickAddTaskPaneProps = {
  onRequestSignIn: () => void;
  onClose: (reason?: QuickAddCloseReason) => void;
};

export function QuickAddTaskPane({
  onRequestSignIn,
  onClose,
}: QuickAddTaskPaneProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedAtRef = useRef(0);
  const exitFinishedRef = useRef(false);
  const closeAfterSaveRef = useRef(false);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [title, setTitle] = useState("");
  const [bucket, setBucket] = useState<Bucket>("next");
  const [dayChoice, setDayChoice] = useState<NewTaskDayChoice>("today");
  const [pickedDate, setPickedDate] = useState(() => todayIso());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enterGeneration, setEnterGeneration] = useState(0);
  const [exiting, setExiting] = useState(false);

  const today = todayIso();
  const { data: todayTasks } = useGetTasksForDayQuery(today);
  const nowCount =
    todayTasks?.tasks.filter((task) => task.bucket === "now").length ?? 0;

  const [createTask] = useCreateTaskMutation();

  const resetForm = useCallback(() => {
    setTitle("");
    setBucket("next");
    setDayChoice("today");
    setPickedDate(today);
    setProjectId(null);
    setSubmitting(false);
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
        // Web preview (no Tauri): allow manual open for layout checks.
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

  const scheduledDate = resolveScheduledDate(dayChoice, pickedDate, today);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed || submitting || !session) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await createTask(
        createTaskBody({
          title: trimmed,
          description: null,
          scheduledDate,
          bucket: scheduledDate === null ? null : bucket,
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
      <div className="border border-rule bg-card px-[14px] py-[12px] text-[13px] text-muted-foreground shadow-sm">
        Loading...
      </div>,
    );
  }

  if (!session) {
    return shell(
      <div className="flex items-center justify-between gap-[12px] border border-rule bg-card px-[14px] py-[12px] shadow-sm">
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

  const quickAddRowLabelClass =
    "w-[56px] shrink-0 whitespace-nowrap text-[10px] font-extrabold uppercase tracking-[0.08em] text-faint";

  return shell(
    <div
      className="flex w-[520px] flex-col border border-rule bg-card shadow-sm"
      aria-busy={submitting || undefined}
    >
      <div className="flex items-start gap-[8px] px-[12px] py-[10px]">
        <div className="min-w-0 flex-1">
          <input
            ref={titleRef}
            type="text"
            value={title}
            disabled={submitting}
            placeholder="What needs doing?"
            className="w-full bg-transparent text-[15px] font-semibold leading-tight outline-none placeholder:text-faint disabled:opacity-70"
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="mt-[4px] flex min-h-[16px] items-center gap-[6px] text-[11px] text-faint">
            {submitting ? (
              <>
                <Spinner className="size-3 text-muted-foreground" aria-hidden />
                <span>Saving task…</span>
              </>
            ) : (
              "Enter to save · Esc to close"
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close Quick Add"
          disabled={submitting}
          className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
          onClick={closeWithAnimation}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-[8px] overflow-x-hidden overflow-y-auto border-t border-rule px-[12px] py-[10px]">
        <TaskScheduleFields
          layout="quickAdd"
          dayChoice={dayChoice}
          bucket={bucket}
          pickedDate={pickedDate}
          nowCount={nowCount}
          onDayChoiceChange={setDayChoice}
          onBucketChange={setBucket}
          onPickedDateChange={setPickedDate}
        />

        <div className="relative z-10 flex flex-nowrap items-center gap-[8px]">
          <div className={quickAddRowLabelClass}>Project</div>
          <ProjectPicker
            compact
            value={projectId}
            onChange={setProjectId}
            triggerClassName="py-[4px] text-[12px]"
          />
        </div>
      </div>
    </div>,
  );
}
