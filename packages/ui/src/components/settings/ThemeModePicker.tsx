import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

type PreviewKind = "light" | "dark" | "system";

const options: {
  value: ThemePreference;
  label: string;
  preview: PreviewKind;
}[] = [
  { value: "light", label: "Light", preview: "light" },
  { value: "dark", label: "Dark", preview: "dark" },
  { value: "system", label: "System", preview: "system" },
];

function ThemePreview({ kind }: { kind: PreviewKind }) {
  if (kind === "light") {
    return (
      <div
        data-appearance-preview="light"
        className="h-[38px] w-full"
        aria-hidden
      />
    );
  }

  if (kind === "dark") {
    return (
      <div
        data-appearance-preview="dark"
        className="h-[38px] w-full"
        aria-hidden
      />
    );
  }

  return (
    <div className="flex h-[38px] w-full overflow-hidden" aria-hidden>
      <div data-appearance-preview="light" className="h-full w-1/2" />
      <div data-appearance-preview="dark" className="h-full w-1/2" />
    </div>
  );
}

export function ThemeModePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <section className="max-w-[480px] space-y-[12px]">
      <h2 className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
        Appearance
      </h2>
      <p className="text-[13px] text-muted-foreground">
        Choose light, dark, or match your device. Applies to the web app, desktop,
        and Quick Add.
      </p>
      <div className="flex flex-wrap gap-[10px]">
        {options.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={selected}
              className={cn(
                "flex w-[96px] flex-col gap-[6px] p-[8px] text-left",
                selected
                  ? "border-2 border-foreground"
                  : "border border-rule",
              )}
              onClick={() => setPreference(option.value)}
            >
              <ThemePreview kind={option.preview} />
              <span
                className={cn(
                  "text-[11.5px]",
                  selected ? "font-bold text-foreground" : "text-muted-foreground",
                )}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
