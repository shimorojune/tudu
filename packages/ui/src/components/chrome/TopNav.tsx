import { Link } from "@tanstack/react-router";
import { Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/chrome/BrandMark";
import { DateNav } from "@/components/chrome/DateNav";
import { DayJump } from "@/components/chrome/DayJump";
import { NavTabs } from "@/components/chrome/NavTabs";

function NewTaskButton() {
  return (
    <button
      type="button"
      aria-label="New task"
      className="flex items-center gap-[7px] bg-primary px-[13px] py-[7px] text-[12.5px] font-bold text-primary-foreground"
      onClick={() => {
        // TODO(step 4): open the new task flow.
        toast("New task lands in step 4");
      }}
    >
      <Plus size={13} strokeWidth={2.4} />
      New task
    </button>
  );
}

function SettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="Settings"
      className="text-muted-foreground"
    >
      <SlidersHorizontal size={17} strokeWidth={1.6} />
    </Link>
  );
}

export function TopNav() {
  return (
    <header className="flex h-[56px] shrink-0 items-center gap-[28px] border-b border-rule bg-card px-[22px]">
      <BrandMark />
      <NavTabs />
      <div className="ml-auto flex items-center gap-[18px]">
        <DateNav />
        <DayJump />
        <div className="h-[20px] w-px bg-hair" />
        <NewTaskButton />
        <SettingsLink />
      </div>
    </header>
  );
}
