import { useTheme } from "@/hooks/useTheme";
import type { CustomThemeColors, PaletteId } from "@/lib/themePalettes";
import { FONT_STACKS, PALETTE_PRESETS, PALETTE_PREVIEW_SWATCH } from "@/lib/themePalettes";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const presetIds = Object.keys(PALETTE_PRESETS) as Exclude<PaletteId, "custom">[];

type ColorField = keyof CustomThemeColors;

const colorFields: { key: ColorField; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "tertiary", label: "Tertiary" },
  { key: "background", label: "Background" },
];

function PaletteSwatch({ id }: { id: Exclude<PaletteId, "custom"> }) {
  const swatch = PALETTE_PREVIEW_SWATCH[id];
  return (
    <div className="flex h-[28px] w-full overflow-hidden" aria-hidden>
      <div
        className="h-full w-1/3"
        style={{ background: swatch.light }}
      />
      <div
        className="h-full w-1/3"
        style={{ background: swatch.dark }}
      />
      <div
        className="h-full w-1/3"
        style={{ background: swatch.accent }}
      />
    </div>
  );
}

export function ThemePalettePicker() {
  const {
    paletteId,
    setPaletteId,
    customColors,
    setCustomColors,
    fontId,
    setFontId,
  } = useTheme();

  function updateCustomColor(key: ColorField, value: string) {
    setCustomColors({ ...customColors, [key]: value });
  }

  return (
    <section className="mt-[28px] max-w-[520px] space-y-[16px]">
      <div className="space-y-[12px]">
        <h2 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Color theme
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Pick a preset or choose Custom to set your own primary, secondary,
          tertiary, and background colors. Background also tints panels and
          settings surfaces.
        </p>
        <div className="flex flex-wrap gap-[10px]">
          {presetIds.map((id) => {
            const selected = paletteId === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={PALETTE_PRESETS[id].label}
                aria-pressed={selected}
                className={cn(
                  "flex w-[108px] flex-col gap-[6px] p-[8px] text-left",
                  selected
                    ? "border-2 border-foreground"
                    : "border border-rule",
                )}
                onClick={() => setPaletteId(id)}
              >
                <PaletteSwatch id={id} />
                <span
                  className={cn(
                    "text-[11.5px]",
                    selected
                      ? "font-bold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {PALETTE_PRESETS[id].label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-label="Custom"
            aria-pressed={paletteId === "custom"}
            className={cn(
              "flex w-[108px] flex-col gap-[6px] p-[8px] text-left",
              paletteId === "custom"
                ? "border-2 border-foreground"
                : "border border-rule",
            )}
            onClick={() => setPaletteId("custom")}
          >
            <div
              className="flex h-[28px] w-full items-center justify-center border border-dashed border-rule text-[10px] text-muted-foreground"
              aria-hidden
            >
              Your colors
            </div>
            <span
              className={cn(
                "text-[11.5px]",
                paletteId === "custom"
                  ? "font-bold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              Custom
            </span>
          </button>
        </div>
      </div>

      {paletteId === "custom" ? (
        <div className="space-y-[10px] border-t border-hair pt-[16px]">
          <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
            Custom colors
          </h3>
          <div className="space-y-[10px]">
            {colorFields.map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between gap-[12px]"
              >
                <label
                  htmlFor={`theme-custom-${field.key}`}
                  className="text-[13px] text-foreground"
                >
                  {field.label}
                </label>
                <input
                  id={`theme-custom-${field.key}`}
                  type="color"
                  aria-label={field.label}
                  value={customColors[field.key] ?? "#888888"}
                  className="size-[36px] cursor-pointer border border-rule bg-transparent p-0"
                  onChange={(event) => {
                    updateCustomColor(field.key, event.target.value);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-[8px] border-t border-hair pt-[16px]">
        <h3 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          Font
        </h3>
        <Select
          value={fontId}
          onValueChange={(value) => {
            setFontId(value as typeof fontId);
          }}
        >
          <SelectTrigger className="w-full max-w-[280px]" aria-label="Font">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="archivo">Archivo</SelectItem>
            <SelectItem value="ar-one-sans">AR One Sans</SelectItem>
            <SelectItem value="system">System UI</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[12px] text-muted-foreground">
          Preview:{" "}
          <span style={{ fontFamily: FONT_STACKS[fontId] }}>The quick brown fox</span>
        </p>
      </div>
    </section>
  );
}
