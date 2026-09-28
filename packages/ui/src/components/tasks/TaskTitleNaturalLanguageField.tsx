import { useCallback, useEffect, useRef } from "react";
import type { QuickAddNaturalLanguageParse } from "@tudu/shared";
import { renderQuickAddHighlightedTitle } from "@/lib/quickAddHighlight";
import { cn } from "@/lib/utils";

export type TaskTitleNaturalLanguageFieldProps = {
  value: string;
  onChange: (value: string) => void;
  parse: QuickAddNaturalLanguageParse | null;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  mirrorClassName?: string;
  inputClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
};

export function TaskTitleNaturalLanguageField({
  value,
  onChange,
  parse,
  placeholder = "What needs doing?",
  disabled,
  inputRef: externalInputRef,
  mirrorClassName,
  inputClassName,
  onKeyDown,
}: TaskTitleNaturalLanguageFieldProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  const syncTitleScroll = useCallback(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) {
      return;
    }
    mirror.scrollLeft = input.scrollLeft;
  }, [inputRef]);

  useEffect(() => {
    syncTitleScroll();
  }, [value, parse, syncTitleScroll]);

  return (
    <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-w-0">
      <div
        ref={mirrorRef}
        aria-hidden
        className={cn(
          "pointer-events-none flex items-center overflow-x-hidden overflow-y-hidden whitespace-pre text-foreground",
          mirrorClassName,
        )}
      >
        {renderQuickAddHighlightedTitle(value, parse?.spans ?? [])}
        {!value ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "text-transparent caret-primary placeholder:text-transparent disabled:opacity-70",
          inputClassName,
        )}
        onChange={(event) => {
          onChange(event.target.value);
          window.requestAnimationFrame(syncTitleScroll);
        }}
        onScroll={syncTitleScroll}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
