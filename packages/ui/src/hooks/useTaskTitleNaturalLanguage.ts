import { useEffect, useState } from "react";
import {
  parseQuickAddNaturalLanguage,
  type QuickAddNaturalLanguageParse,
} from "@tudu/shared";

const CHRONO_DEBOUNCE_MS = 150;

export function useTaskTitleNaturalLanguage(title: string, todayIso: string) {
  const [parse, setParse] = useState<QuickAddNaturalLanguageParse | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setParse(parseQuickAddNaturalLanguage(title, new Date(), todayIso));
    }, CHRONO_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [title, todayIso]);

  return parse;
}
