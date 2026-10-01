import { useEffect } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@tudu/store";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";

/** Close the commands palette when a task inspector opens so list clicks are not blocked. */
export function CommandPaletteSelectionSync() {
  const selectedTaskId = useSelector(
    (state: RootState) => state.day.selectedTaskId,
  );
  const { setOpen } = useCommandPalette();

  useEffect(() => {
    if (selectedTaskId) {
      setOpen(false);
    }
  }, [selectedTaskId, setOpen]);

  return null;
}
