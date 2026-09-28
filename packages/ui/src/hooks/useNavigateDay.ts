import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import { goToToday, setSelectedDate, type RootState } from "@tudu/store";
import { dateLinkSearch } from "@/lib/daySearch";
import { shiftIso } from "@/lib/dayLabel";
import { useActiveOrgSlug } from "@/hooks/useSpaceContext";

export function useNavigateDay() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const orgSlug = useActiveOrgSlug();
  const selectedDate = useSelector((state: RootState) => state.day.selectedDate);
  const today = effectiveDayIso();
  const todayTo = orgSlug ? "/o/$orgSlug" : "/";

  const goToDate = useCallback(
    (iso: string) => {
      dispatch(setSelectedDate(iso));
      void navigate({
        to: todayTo,
        params: orgSlug ? { orgSlug } : undefined,
        search: (prev) =>
          dateLinkSearch(
            iso,
            prev as Record<string, unknown>,
            today,
          ) as Record<string, unknown>,
      });
    },
    [dispatch, navigate, orgSlug, today, todayTo],
  );

  const shiftDay = useCallback(
    (delta: number) => {
      goToDate(shiftIso(selectedDate, delta));
    },
    [goToDate, selectedDate],
  );

  const backToToday = useCallback(() => {
    dispatch(goToToday());
    void navigate({
      to: todayTo,
      params: orgSlug ? { orgSlug } : undefined,
      search: (prev) => {
        const next = { ...(prev as Record<string, unknown>) };
        delete next.date;
        delete next.task;
        delete next.tab;
        return next;
      },
    });
  }, [dispatch, navigate, orgSlug, todayTo]);

  const jumpToTodayTab = useCallback(() => {
    dispatch(goToToday());
    void navigate({
      to: todayTo,
      params: orgSlug ? { orgSlug } : undefined,
      search: (prev) => {
        const next = { ...(prev as Record<string, unknown>) };
        delete next.date;
        delete next.task;
        delete next.tab;
        return next;
      },
    });
  }, [dispatch, navigate, orgSlug, todayTo]);

  return {
    backToToday,
    goToDate,
    jumpToTodayTab,
    orgSlug,
    selectedDate,
    shiftDay,
    today,
    todayTo,
  };
}
