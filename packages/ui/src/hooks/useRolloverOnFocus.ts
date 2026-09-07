import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { effectiveDayIso } from "@tudu/shared";
import {
  setSelectedDate,
  useRolloverMutation,
  type RootState,
} from "@tudu/store";
import { readLastRun, writeLastRun } from "@/lib/rolloverState";

export function useRolloverOnFocus(enabled = true) {
  const dispatch = useDispatch();
  const selectedDate = useSelector((s: RootState) => s.day.selectedDate);
  const [rollover] = useRolloverMutation();
  const inFlightRef = useRef(false);

  const maybeRollover = useCallback(
    async (toDate?: string) => {
      if (!enabled || inFlightRef.current) {
        return;
      }

      const effective = toDate ?? effectiveDayIso();
      const last = readLastRun();
      if (last === effective) {
        return;
      }

      inFlightRef.current = true;
      try {
        const result = await rollover({ toDate: effective }).unwrap();
        writeLastRun(effective);
        if (selectedDate < effective) {
          dispatch(setSelectedDate(effective));
        }
        return result;
      } finally {
        inFlightRef.current = false;
      }
    },
    [dispatch, enabled, rollover, selectedDate],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void maybeRollover();

    const onFocus = () => {
      void maybeRollover();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void maybeRollover();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, maybeRollover]);

  return { maybeRollover };
}
