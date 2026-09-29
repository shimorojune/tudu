import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDispatch } from "react-redux";
import { goToToday, requestAddTask, useGetProjectsQuery } from "@tudu/store";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import {
  buildAppCommands,
  commandsByGroup,
  isDesktopApp,
  type AppCommand,
  type CommandGroup as CommandGroupName,
} from "@/lib/commands";
import { useNavigateDay } from "@/hooks/useNavigateDay";
import { defaultWeekId } from "@/lib/week";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { isCommandPaletteBlocked } from "@/components/chrome/dialogBlocker";

const GROUP_ORDER: CommandGroupName[] = ["Go", "Actions"];

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: projects = [] } = useGetProjectsQuery();
  const grouped = commandsByGroup(buildAppCommands(projects));
  const { shiftDay } = useNavigateDay();
  const jumpToThisWeek = useCallback(() => {
    void navigate({ to: "/week", search: { week: defaultWeekId() } });
  }, [navigate]);

  const runCommand = useCallback(
    (command: AppCommand) => {
      setOpen(false);

      switch (command.action.kind) {
        case "navigate":
          if (command.action.goToToday) {
            dispatch(goToToday());
            void navigate({
              to: "/",
              search: (prev: Record<string, unknown>) => {
                const next = { ...prev };
                delete next.date;
                delete next.task;
                delete next.tab;
                return next;
              },
            } as never);
            return;
          }
          if (command.action.to === "/projects/$projectId" && command.action.params) {
            void navigate({
              to: "/projects/$projectId",
              params: command.action.params,
            });
            return;
          }
          void navigate({
            to: command.action.to,
            search: command.action.search ?? {},
          } as never);
          return;
        case "requestAddTask":
          dispatch(requestAddTask());
          return;
        case "jumpToThisWeek":
          jumpToThisWeek();
          return;
        case "shiftDay":
          shiftDay(command.action.delta);
          return;
        default:
          return;
      }
    },
    [dispatch, jumpToThisWeek, navigate, shiftDay],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) {
          setOpen(false);
        } else if (!isCommandPaletteBlocked()) {
          setOpen(true);
        }
        return;
      }

      if (
        mod &&
        event.shiftKey &&
        event.key.toLowerCase() === "w" &&
        isDesktopApp()
      ) {
        event.preventDefault();
        jumpToThisWeek();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpToThisWeek, open, setOpen]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      showCloseButton={false}
      title="Commands"
      description="Search for a command to run"
      className="top-[20%] translate-y-0 sm:max-w-[620px]"
    >
      <CommandInput placeholder="Search commands..." />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        {GROUP_ORDER.map((group) => {
          const items = grouped.get(group);
          if (!items?.length) {
            return null;
          }
          return (
            <CommandGroup key={group} heading={group}>
              {items.map((command) => (
                <CommandItem
                  key={command.id}
                  value={[command.label, ...command.keywords].join(" ")}
                  onSelect={() => runCommand(command)}
                >
                  <span>{command.label}</span>
                  {command.shortcut ? (
                    <CommandShortcut>{command.shortcut}</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
      <div className="flex items-center justify-between border-t border-hair bg-background px-[18px] py-[12px] text-[11.5px] text-muted-foreground">
        <span>Type to filter commands</span>
        <span className="font-mono text-faint">Esc</span>
      </div>
    </CommandDialog>
  );
}
