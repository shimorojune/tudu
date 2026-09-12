import { useEffect, useRef } from "react";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";
import { hydrateDay, todayIso, type RootState } from "@tudu/store";
import {
  type DaySearchFields,
  daySearchToastMessage,
  findDaySearchIssues,
  mergeDaySearch,
  parseDaySearch,
  planDaySearchSync,
  rawSearchFromString,
} from "@/lib/daySearch";

export type DaySearchSyncOptions = {
  weekDays?: readonly string[];
  taskFound?: boolean | null;
  clearTask?: boolean;
  today?: string;
};

export function useDaySearchSync(
  fields: DaySearchFields,
  options: DaySearchSyncOptions = {},
) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const searchStr = useRouterState({
    select: (state) => {
      const location = state.location as { searchStr?: string };
      return location.searchStr ?? "";
    },
  });
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const selectedTaskId = useSelector((state: RootState) => state.day.selectedTaskId);
  const inspectorTab = useSelector((state: RootState) => state.day.inspectorTab);
  const today = options.today ?? todayIso();
  const weekDays = options.weekDays;
  const taskFound = options.taskFound ?? null;
  const clearTask = options.clearTask === true;
  const toastedKey = useRef<string | null>(null);
  const lastUrlKey = useRef<string | null>(null);
  const lastReduxKey = useRef<string | null>(null);
  const lastRawKey = useRef<string | null>(null);

  const parsed = parseDaySearch(search, fields);
  const urlKey = `${parsed.date ?? ""}|${parsed.task ?? ""}|${parsed.tab ?? ""}`;
  const reduxKey = `${selectedDate}|${selectedTaskId ?? ""}|${inspectorTab}`;
  const rawKey =
    searchStr ||
    (typeof window === "undefined" ? "" : window.location.search);
  const issues = findDaySearchIssues(rawSearchFromString(rawKey), fields, {
    weekDays,
  });
  const issueKey = issues.join(",");
  const weekKey = weekDays?.join(",") ?? "";

  useEffect(() => {
    const urlChanged = lastUrlKey.current !== urlKey;
    const reduxChanged = lastReduxKey.current !== reduxKey;
    lastUrlKey.current = urlKey;
    lastReduxKey.current = reduxKey;

    const plan = planDaySearchSync({
      fields,
      parsed,
      redux: {
        date: selectedDate,
        taskId: selectedTaskId,
        tab: inspectorTab,
      },
      today,
      urlChanged,
      reduxChanged,
      issues,
      weekDays,
      taskFound,
      clearTask,
    });

    if (plan.action === "none") {
      return;
    }

    if (plan.toast) {
      const key = `${plan.toast}:${rawKey}:${urlKey}`;
      if (toastedKey.current !== key) {
        toastedKey.current = key;
        toast.error(daySearchToastMessage(plan.toast));
      }
    }

    if (plan.hydrate) {
      dispatch(hydrateDay(plan.hydrate));
    }

    const shouldForceClean =
      Boolean(plan.toast) &&
      lastRawKey.current !== rawKey &&
      plan.write === undefined;
    if (plan.write || shouldForceClean) {
      lastRawKey.current = rawKey;
      void navigate({
        search: (prev: Record<string, unknown>) =>
          mergeDaySearch(prev, fields, plan.write ?? {}),
        replace: plan.replace,
      } as never);
    }
  }, [
    urlKey,
    issueKey,
    selectedDate,
    selectedTaskId,
    inspectorTab,
    today,
    taskFound,
    clearTask,
    rawKey,
    weekKey,
    dispatch,
    navigate,
  ]);
}
