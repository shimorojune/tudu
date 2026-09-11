import { cn } from "@/lib/utils";
import { personInitials } from "@/lib/person";

type TeamAvatarProps = {
  name: string;
  filled?: boolean;
  size?: "sm" | "md";
};

export function TeamAvatar({ name, filled = false, size = "md" }: TeamAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center font-extrabold",
        size === "sm" ? "size-[24px] text-[11px]" : "size-[32px] text-[12.5px]",
        filled
          ? "bg-foreground text-card"
          : "border-[1.5px] border-rule text-foreground",
      )}
    >
      {personInitials(name)}
    </div>
  );
}
