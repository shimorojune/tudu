import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CarryDotsProps = {
  carriedDays: number;
  slipping?: boolean;
};

function carryLabel(carriedDays: number, slipping: boolean): string {
  const dayWord = carriedDays === 1 ? "day" : "days";
  if (slipping) {
    return `Carried ${carriedDays} ${dayWord}, slipping`;
  }
  return `Carried ${carriedDays} ${dayWord}`;
}

export function CarryDots({ carriedDays, slipping = false }: CarryDotsProps) {
  if (carriedDays <= 0) {
    return <span className="w-0 shrink-0" aria-hidden />;
  }

  const count = Math.min(carriedDays, 3);
  const label = carryLabel(carriedDays, slipping);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 gap-[3px] self-start pt-[6px]"
          tabIndex={0}
          aria-label={label}
        >
          {Array.from({ length: count }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-[5px]",
                slipping ? "bg-primary" : "bg-foreground",
              )}
              style={{ borderRadius: "50%" }}
              aria-hidden
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[220px]">
        {slipping ? (
          <span className="flex flex-col gap-[4px]">
            <span>{label}</span>
            <span className="text-background/70">
              Two days or more, or past deadline
            </span>
          </span>
        ) : (
          label
        )}
      </TooltipContent>
    </Tooltip>
  );
}
