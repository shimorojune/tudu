import { useMemo, useState } from "react";
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

export function ColourPicker({
  value,
  onChange,
  clashes = [],
  disabled = false,
  label = "Colour",
}: ColourPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const clashByColor = useMemo(() => {
    const map = new Map<ProjectColor, string>();
    for (const clash of clashes) {
      map.set(clash.color, clash.shortCode);
    }
    return map;
  }, [clashes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return PROJECT_COLORS;
    }
    return PROJECT_COLORS.filter((color) =>
      COLOR_LABEL[color].toLowerCase().startsWith(q),
    );
  }, [query]);

  function pick(color: ProjectColor) {
    onChange(color);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-muted-foreground">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${label}, ${COLOR_LABEL[value]}`}
            className="flex h-10 w-full items-center gap-3 border border-rule bg-card px-3 text-left text-[13px] font-medium disabled:opacity-50"
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                setOpen(true);
              }
            }}
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
          className="w-[min(100vw-32px,280px)] border border-rule bg-card p-3 shadow-lg"
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a name"
            className="mb-3 h-9 w-full border border-rule bg-background px-2 text-[13px]"
            aria-label="Filter colours"
          />
          <div
            className="grid grid-cols-4 gap-2"
            role="listbox"
            aria-label="Colour options"
          >
            {filtered.map((color) => {
              const code = clashByColor.get(color);
              return (
                <button
                  key={color}
                  type="button"
                  role="option"
                  aria-selected={color === value}
                  aria-label={COLOR_LABEL[color]}
                  className={cn(
                    "relative flex h-12 flex-col items-center justify-end gap-1 border border-rule p-1 text-[10px] font-semibold",
                    color === value && "outline outline-2 outline-foreground",
                  )}
                  style={{ background: SPACE_COLOR_HEX[color] }}
                  onClick={() => pick(color)}
                >
                  {code ? (
                    <span className="bg-card px-1 text-[9px] text-foreground">
                      {code}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {clashes.length > 0 ? (
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              Labelled colours are taken by another project in this space. You
              can still pick them.
            </p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
