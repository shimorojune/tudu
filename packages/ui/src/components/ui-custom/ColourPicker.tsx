import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  PROJECT_COLORS,
  SPACE_COLOR_HEX,
  type ProjectColor,
} from "@tudu/shared";
import { projectColorCss } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ColourClash = {
  color: ProjectColor;
  shortCode: string;
};

export type ColourPickerProps = {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  clashes?: ColourClash[];
  disabled?: boolean;
  label?: string;
  compact?: boolean;
};

const COLOR_LABEL: Record<ProjectColor, string> = {
  vermilion: "Vermilion",
  amber: "Amber",
  ochre: "Ochre",
  moss: "Moss",
  jade: "Jade",
  teal: "Teal",
  cobalt: "Cobalt",
  iris: "Iris",
  plum: "Plum",
  rose: "Rose",
  graphite: "Graphite",
  ink: "Ink",
};

const GRID_COLUMNS = 6;

function colorIndex(color: ProjectColor): number {
  return PROJECT_COLORS.indexOf(color);
}

function moveIndex(current: number, key: string, max: number): number {
  const row = Math.floor(current / GRID_COLUMNS);
  const col = current % GRID_COLUMNS;
  if (key === "ArrowLeft") {
    return col === 0 ? current : current - 1;
  }
  if (key === "ArrowRight") {
    return col === GRID_COLUMNS - 1 || current >= max ? current : current + 1;
  }
  if (key === "ArrowUp") {
    return row === 0 ? current : current - GRID_COLUMNS;
  }
  if (key === "ArrowDown") {
    return current + GRID_COLUMNS > max ? current : current + GRID_COLUMNS;
  }
  return current;
}

export function ColourPicker({
  value,
  onChange,
  clashes = [],
  disabled = false,
  label = "Colour",
  compact = false,
}: ColourPickerProps) {
  const [open, setOpen] = useState(false);
  const [typeAhead, setTypeAhead] = useState("");
  const [focusIndex, setFocusIndex] = useState(() => colorIndex(value));
  const typeAheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clashByColor = useMemo(() => {
    const map = new Map<ProjectColor, string>();
    for (const clash of clashes) {
      map.set(clash.color, clash.shortCode);
    }
    return map;
  }, [clashes]);

  const visibleColors = useMemo(() => {
    const q = typeAhead.trim().toLowerCase();
    if (!q) {
      return PROJECT_COLORS;
    }
    const match = PROJECT_COLORS.find((color) =>
      COLOR_LABEL[color].toLowerCase().startsWith(q),
    );
    return match ? [match] : [];
  }, [typeAhead]);

  const displayColors = visibleColors.length > 0 ? visibleColors : PROJECT_COLORS;

  function pick(color: ProjectColor) {
    onChange(color);
    setOpen(false);
    setTypeAhead("");
  }

  useEffect(() => {
    if (!open) {
      setTypeAhead("");
      setFocusIndex(colorIndex(value));
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const color = displayColors[focusIndex] ?? displayColors[0];
        if (color) {
          pick(color);
        }
        return;
      }
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        setFocusIndex((current) =>
          moveIndex(current, event.key, displayColors.length - 1),
        );
        return;
      }
      if (event.key.length === 1 && /[a-z]/i.test(event.key)) {
        event.preventDefault();
        setTypeAhead((prev) => {
          const next = `${prev}${event.key.toLowerCase()}`;
          const match = PROJECT_COLORS.find((color) =>
            COLOR_LABEL[color].toLowerCase().startsWith(next),
          );
          if (match) {
            setFocusIndex(colorIndex(match));
          }
          return next;
        });
        if (typeAheadTimer.current) {
          clearTimeout(typeAheadTimer.current);
        }
        typeAheadTimer.current = setTimeout(() => setTypeAhead(""), 700);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayColors, focusIndex, open, value]);

  const field = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}, ${COLOR_LABEL[value]}`}
          aria-expanded={open}
          className={cn(
            "flex h-10 items-center gap-3 border bg-card px-3 text-left text-[13px] font-medium disabled:opacity-50",
            compact ? "w-[220px]" : "w-full",
            open ? "border-foreground" : "border-rule",
          )}
        >
          <span
            className="h-5 w-5 shrink-0 border border-rule"
            style={{ background: projectColorCss(value) }}
          />
          <span>{COLOR_LABEL[value]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={0}
        className="w-[248px] border border-t-0 border-rule bg-card p-3 shadow-lg"
      >
        <div
          className="grid grid-cols-6 gap-2"
          role="listbox"
          aria-label="Colour options"
        >
          {displayColors.map((color, index) => {
            const code = clashByColor.get(color);
            const selected = color === value;
            const focused = index === focusIndex;
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={COLOR_LABEL[color]}
                className={cn(
                  "relative flex h-10 w-10 flex-col items-stretch justify-end overflow-hidden border border-rule/40",
                  focused && "outline outline-1 outline-foreground",
                  selected && "shadow-[inset_0_0_0_2px_var(--foreground)]",
                )}
                style={{ background: SPACE_COLOR_HEX[color] }}
                onMouseEnter={() => setFocusIndex(index)}
                onClick={() => pick(color)}
              >
                {selected ? (
                  <Check
                    size={14}
                    strokeWidth={2.4}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
                    aria-hidden
                  />
                ) : null}
                {code ? (
                  <span className="bg-foreground/85 px-0.5 text-center text-[8px] font-bold leading-tight text-background">
                    {code}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {clashes.length > 0 ? (
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Labelled colours are taken by another project in this space. You can
            still pick them.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );

  if (compact) {
    return field;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-muted-foreground">
        {label}
      </span>
      {field}
    </div>
  );
}
