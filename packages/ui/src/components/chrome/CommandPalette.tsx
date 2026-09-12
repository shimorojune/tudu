import { useCallback, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useDispatch } from "react-redux";
import {
  goToToday,
  requestAddTask,
  useAcceptInboxItemMutation,
  useGetInboxQuery,
  useGetProjectsQuery,
} from "@tudu/store";
import { effectiveDayIso, type Bucket } from "@tudu/shared";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import {
  buildAppCommands,
  commandsByGroup,
  isDesktopApp,
  type AppCommand,
  type CommandGroup as CommandGroupName,
} from "@/lib/commands";
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

const GROUP_ORDER: CommandGroupName[] = ["Go", "Actions"];

const INBOX_ACCEPT: { id: string; label: string; bucket: Bucket; shortcut: string }[] = [
  { id: "inbox-now", label: "Accept into Now", bucket: "now", shortcut: "Cmd+1" },
  { id: "inbox-next", label: "Accept into Next", bucket: "next", shortcut: "Cmd+2" },
  { id: "inbox-later", label: "Accept into Later", bucket: "later", shortcut: "Cmd+3" },
];

export function isCommandPaletteBlocked(): boolean {
  return (
    document.querySelector("[role='dialog'],[role='alertdialog']") !== null
  );
}

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: projects = [] } = useGetProjectsQuery();
  const grouped = commandsByGroup(buildAppCommands(projects));
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onInbox = pathname === "/inbox";
  const { data: inbox } = useGetInboxQuery(undefined, {
    skip: !onInbox,
  });
  const [acceptInbox] = useAcceptInboxItemMutation();
  const pending = inbox?.pending[0] ?? null;
  const inboxActions = onInbox && pending ? INBOX_ACCEPT : [];

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
        default:
          return;
      }
    },
    [dispatch, jumpToThisWeek, navigate],
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
        {inboxActions.length > 0 ? (
          <CommandGroup heading="Inbox">
            {inboxActions.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} inbox accept ${item.bucket}`}
                onSelect={() => {
                  if (!pending) {
                    return;
                  }
                  setOpen(false);
                  void acceptInbox({
                    id: pending.id,
                    bucket: item.bucket,
                    scheduledDate: effectiveDayIso(),
                  });
                }}
              >
                <span>{item.label}</span>
                <CommandShortcut>{item.shortcut}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="flex items-center justify-between border-t border-hair bg-background px-[18px] py-[12px] text-[11.5px] text-muted-foreground">
        <span>Type to filter commands</span>
        <span className="font-mono text-faint">Esc</span>
      </div>
    </CommandDialog>
  );
}
