import { useEffect, useRef } from "react";
import type { Bucket, QuickAddNaturalLanguageParse } from "@tudu/shared";
import {
  QUICK_ADD_DEADLINE_CONFIDENCE_MIN,
  QUICK_ADD_START_CONFIDENCE_MIN,
} from "@tudu/shared";
import { useQuickAddSuggestMutation } from "@tudu/store";

const JEV_DEBOUNCE_MS = 400;

export type FieldSource = "auto" | "manual";

export type TaskFieldSuggestArgs = {
  title: string;
  parse: QuickAddNaturalLanguageParse | null;
  today: string;
  scheduledDate: string | null;
  nowCount: number;
  scheduleSource: FieldSource;
  bucketSource: FieldSource;
  projectSource: FieldSource;
  startSource: FieldSource;
  deadlineSource: FieldSource;
  onProjectId: (id: string | null, name: string | null) => void;
  onBucket: (bucket: Bucket) => void;
  onDayChoice: (choice: import("@/components/tasks/TaskScheduleFields").NewTaskDayChoice) => void;
  onPickedDate: (iso: string) => void;
  onStartDate: (iso: string) => void;
  onDeadline: (iso: string | null) => void;
  onJevSuggesting: (busy: boolean) => void;
};

export function useTaskFieldSuggest({
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
  onProjectId,
  onBucket,
  onDayChoice,
  onPickedDate,
  onStartDate,
  onDeadline,
  onJevSuggesting,
}: TaskFieldSuggestArgs) {
  const jevRequestIdRef = useRef(0);
  const handlersRef = useRef({
    onProjectId,
    onBucket,
    onDayChoice,
    onPickedDate,
    onStartDate,
    onDeadline,
    onJevSuggesting,
  });
  handlersRef.current = {
    onProjectId,
    onBucket,
    onDayChoice,
    onPickedDate,
    onStartDate,
    onDeadline,
    onJevSuggesting,
  };
  const [quickAddSuggest] = useQuickAddSuggestMutation();

  useEffect(() => {
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      handlersRef.current.onJevSuggesting(false);
      return;
    }

    const titleForSave = parse?.titleForSave.trim() || trimmed;

    const handle = window.setTimeout(() => {
      const requestId = jevRequestIdRef.current + 1;
      jevRequestIdRef.current = requestId;
      handlersRef.current.onJevSuggesting(true);

      void quickAddSuggest({
        titleForSave,
        rawTitle: trimmed,
        today,
        nowCount,
        scheduledDate,
        parsedStartDate: parse?.startDate ?? null,
        parsedDeadline: parse?.deadline ?? null,
        parsedScheduledDate: parse?.scheduledDate ?? null,
      })
        .unwrap()
        .then((response) => {
          if (jevRequestIdRef.current !== requestId) {
            return;
          }
          if (projectSource === "auto" && response.projectId) {
            handlersRef.current.onProjectId(
              response.projectId,
              response.matchedProjectName,
            );
          }
          if (
            bucketSource === "auto" &&
            response.bucket &&
            scheduledDate !== null
          ) {
            handlersRef.current.onBucket(response.bucket);
          }
          if (
            startSource === "auto" &&
            !parse?.startDate &&
            response.startDate &&
            (response.confidence?.start ?? 0) >= QUICK_ADD_START_CONFIDENCE_MIN
          ) {
            handlersRef.current.onStartDate(response.startDate);
          }
          if (
            deadlineSource === "auto" &&
            !parse?.deadline &&
            response.deadline &&
            (response.confidence?.deadline ?? 0) >=
              QUICK_ADD_DEADLINE_CONFIDENCE_MIN
          ) {
            handlersRef.current.onDeadline(response.deadline);
          }
        })
        .catch(() => {
          // Jev unavailable: chrono and manual controls still work.
        })
        .finally(() => {
          if (jevRequestIdRef.current === requestId) {
            handlersRef.current.onJevSuggesting(false);
          }
        });
    }, JEV_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [
    title,
    parse,
    today,
    nowCount,
    scheduledDate,
    quickAddSuggest,
    projectSource,
    bucketSource,
    startSource,
    deadlineSource,
  ]);

  useEffect(() => {
    if (scheduleSource !== "auto" || !parse) {
      return;
    }
    handlersRef.current.onDayChoice(parse.dayChoice);
    handlersRef.current.onPickedDate(parse.pickedDate);
  }, [parse, scheduleSource]);

  useEffect(() => {
    if (!parse || startSource !== "auto") {
      return;
    }
    if (parse.startDate) {
      handlersRef.current.onStartDate(parse.startDate);
    }
  }, [parse, startSource]);

  useEffect(() => {
    if (!parse || deadlineSource !== "auto") {
      return;
    }
    if (parse.deadline) {
      handlersRef.current.onDeadline(parse.deadline);
    }
  }, [parse, deadlineSource]);
}
