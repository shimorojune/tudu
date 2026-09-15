import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type MultiSelectProps = {
  values: string[];
  options: MultiSelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
};

export function MultiSelect({
  values,
  options,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search",
  emptyText = "No matches",
  "aria-label": ariaLabel,
  disabled = false,
  className,
  size = "default",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.filter((option) => values.includes(option.value)),
    [options, values],
  );
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} selected`;

  function toggle(value: string) {
    onChange(
      values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value],
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "flex w-full items-center justify-between gap-[8px] border border-rule bg-transparent px-[9px] text-left text-[12.5px] font-normal outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            size === "sm" ? "min-h-[34px] py-[7px]" : "min-h-[36px] py-[8px]",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", selected.length === 0 && "text-faint")}>
            {label}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-faint" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const checked = values.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => toggle(option.value)}
                    className="gap-[8px] text-[12.5px] data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(option.value)}
                      aria-hidden
                      tabIndex={-1}
                      className="pointer-events-none border-input data-[state=checked]:border-primary"
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {checked ? (
                      <Check className="size-3.5 text-foreground" aria-hidden />
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
