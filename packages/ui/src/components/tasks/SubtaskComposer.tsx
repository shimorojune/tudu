import { useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type SubtaskCheckboxProps = {
  checked?: boolean;
  onToggle?: () => void;
};

function SubtaskCheckbox({ checked = false, onToggle }: SubtaskCheckboxProps) {
  const boxClass = cn(
    "flex h-[14px] w-[14px] shrink-0 items-center justify-center border-[1.5px] border-rule bg-card",
    checked && "border-foreground bg-foreground",
  );

  if (!onToggle) {
    return (
      <span className={boxClass} aria-hidden>
        {checked ? (
          <span className="h-[6px] w-[6px] bg-card" aria-hidden />
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={checked ? "Mark subtask incomplete" : "Mark subtask complete"}
      className={boxClass}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {checked ? (
        <span className="h-[6px] w-[6px] bg-card" aria-hidden />
      ) : null}
    </button>
  );
}

function SubtaskRemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove subtask"
      className="mr-[4px] shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/subtask:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <X size={12} strokeWidth={2} aria-hidden />
    </button>
  );
}

export type SubtaskComposerProps = {
  onAdd: (title: string) => void;
  onEnd?: () => void;
  autoFocus?: boolean;
  className?: string;
};

export function SubtaskComposer({
  onAdd,
  onEnd,
  autoFocus = false,
  className,
}: SubtaskComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [hasCommitted, setHasCommitted] = useState(false);

  function commitCurrent() {
    const title = value.trim();
    if (!title) {
      return false;
    }
    onAdd(title);
    setValue("");
    setHasCommitted(true);
    inputRef.current?.focus();
    return true;
  }

  function endComposer() {
    setValue("");
    onEnd?.();
  }

  function handleBlur() {
    const title = value.trim();
    if (title) {
      onAdd(title);
      setValue("");
      setHasCommitted(true);
      return;
    }
    endComposer();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-[11px] border-b border-hair bg-foreground/[0.03] py-[7px] shadow-[inset_2px_0_0_var(--foreground)]",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="flex shrink-0 pl-[11px]">
        <SubtaskCheckbox />
      </span>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        type="text"
        value={value}
        placeholder="Subtask"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            if (!commitCurrent()) {
              endComposer();
            }
          }
          if (event.key === "Escape") {
            event.preventDefault();
            endComposer();
          }
        }}
      />
      <span className="shrink-0 pr-[4px] text-[11px] text-muted-foreground">
        {hasCommitted ? "Esc ends" : "Enter adds another"}
      </span>
    </div>
  );
}

export type SubtaskComposerListProps = {
  committed: { id: string; title: string }[];
  onAdd: (title: string) => void;
  onEdit: (id: string, title: string) => void;
  onRemove: (id: string) => void;
  autoFocus?: boolean;
};

export function SubtaskComposerList({
  committed,
  onAdd,
  onEdit,
  onRemove,
  autoFocus = false,
}: SubtaskComposerListProps) {
  const [active, setActive] = useState(autoFocus || committed.length === 0);

  return (
    <div className="flex flex-col">
      {committed.map((subtask) => (
        <div
          key={subtask.id}
          className="group/subtask flex items-center gap-[11px] border-b border-hair py-[7px]"
        >
          <span className="flex shrink-0 pl-[11px]">
            <SubtaskCheckbox />
          </span>
          <input
            type="text"
            value={subtask.title}
            aria-label="Subtask title"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            onChange={(event) => onEdit(subtask.id, event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <SubtaskRemoveButton onRemove={() => onRemove(subtask.id)} />
        </div>
      ))}
      {active ? (
        <SubtaskComposer
          autoFocus
          onAdd={(title) => {
            onAdd(title);
          }}
        />
      ) : (
        <button
          type="button"
          className="mt-[6px] text-left text-[13px] text-faint hover:text-muted-foreground"
          onClick={() => setActive(true)}
        >
          Add a subtask
        </button>
      )}
    </div>
  );
}
