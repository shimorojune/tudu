import { format, isSameDay, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import {
  canDeclineInboxCard,
  type Bucket,
  type InboxHistoryItem,
  type InboxPendingItem,
} from "@tudu/shared";
import {
  useAcceptInboxItemMutation,
  useDeclineInboxItemMutation,
  useDeleteTaskMutation,
  useGetInboxQuery,
} from "@tudu/store";
import { isCommandPaletteBlocked } from "@/components/chrome/CommandPalette";
import { useCommandPalette } from "@/components/chrome/CommandPaletteContext";
import { InspectorSheet } from "@/components/inspector/InspectorSheet";
import { TaskDeleteDialog } from "@/components/tasks/TaskDeleteDialog";
import { useViewportBand } from "@/hooks/useViewportBand";
import { inboxShortcutAction } from "@/lib/inboxShortcuts";
import { personFirstName, personInitials } from "@/lib/person";
import { cn } from "@/lib/utils";

function sentLabel(createdAt: string, isManager: boolean) {
  const date = parseISO(createdAt);
  const now = new Date();
  const time = format(date, "HH:mm");
  const who = isManager ? " · your manager" : "";

  if (isSameDay(date, now)) {
    return `sent this ${time}${who}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `sent this yesterday ${time}${who}`;
  }

  return `sent this ${format(date, "d MMM")} ${time}${who}`;
}

function historyDate(createdAt: string) {
  return format(parseISO(createdAt), "d MMM");
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex size-[24px] shrink-0 items-center justify-center bg-foreground text-[11px] font-extrabold text-card">
      {personInitials(name)}
    </div>
  );
}

function InboxCard({
  item,
  focused,
  onFocus,
  declining,
  onToggleDecline,
}: {
  item: InboxPendingItem;
  focused: boolean;
  onFocus: () => void;
  declining: boolean;
  onToggleDecline: (open: boolean) => void;
}) {
  const [acceptInbox] = useAcceptInboxItemMutation();
  const [declineInbox] = useDeclineInboxItemMutation();
  const [deleteTask] = useDeleteTaskMutation();
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDecline = canDeclineInboxCard(item.kind);
  const first = personFirstName(item.from.name);
  const isReturned = item.kind === "returned";

  async function accept(bucket: Bucket) {
    await acceptInbox({ id: item.id, bucket });
  }

  async function sendDecline() {
    const trimmed = reason.trim();
    if (!trimmed) {
      return;
    }
    await declineInbox({ id: item.id, reason: trimmed });
    onToggleDecline(false);
    setReason("");
  }

  return (
    <article
      className={cn(
        "flex flex-col gap-[14px] border-b border-hair px-[32px] py-[24px]",
        focused && "bg-foreground/[0.03]",
      )}
      onClick={onFocus}
    >
      <div className="flex items-center gap-[10px]">
        <Avatar name={item.from.name} />
        <span className="text-[12.5px] text-muted-foreground">
          {isReturned ? (
            <>
              <span className="font-bold text-foreground">{first}</span> declined
              this
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">{first}</span>{" "}
              {sentLabel(item.createdAt, true)}
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-[9px]">
        <h2 className="text-[17px] font-bold leading-[1.35] tracking-[-0.01em]">
          {item.task.title}
        </h2>
        {item.task.startDate || item.task.deadline ? (
          <p className="text-[12.5px] tabular-nums text-muted-foreground">
            {item.task.startDate
              ? `start ${format(new Date(`${item.task.startDate}T12:00:00`), "EEE d MMM")}`
              : null}
            {item.task.startDate && item.task.deadline ? " · " : null}
            {item.task.deadline
              ? `deadline ${format(parseISO(item.task.deadline), "EEE d MMM")}`
              : null}
          </p>
        ) : null}
        {item.task.description ? (
          <p className="border-l-2 border-hair pl-[12px] text-[13.5px] leading-[1.55] text-muted-foreground">
            {item.task.description}
          </p>
        ) : null}
        {isReturned && item.declineReason ? (
          <p className="border-l-2 border-hair pl-[12px] text-[13.5px] leading-[1.55] text-muted-foreground">
            “{item.declineReason}”
          </p>
        ) : null}
      </div>

      {declining && canDecline ? (
        <div className="flex flex-col gap-[10px] border border-rule bg-card p-[14px]">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-faint">
            {first} will see this reason
          </span>
          <textarea
            value={reason}
            rows={3}
            className="w-full resize-none bg-transparent text-[13.5px] leading-[1.55] outline-none"
            placeholder="Why this cannot land in your day today…"
            onChange={(event) => setReason(event.target.value)}
            onClick={(event) => event.stopPropagation()}
          />
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              className="bg-foreground px-[14px] py-[7px] text-[12.5px] font-bold text-card disabled:opacity-40"
              disabled={!reason.trim()}
              onClick={(event) => {
                event.stopPropagation();
                void sendDecline();
              }}
            >
              Send decline
            </button>
            <button
              type="button"
              className="text-[12.5px] text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onToggleDecline(false);
              }}
            >
              Cancel
            </button>
            <span className="ml-auto text-[11.5px] text-faint">
              Goes on the task timeline too
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-[10px] pt-[2px]">
          <button
            type="button"
            className="border border-rule px-[13px] py-[8px] text-[12.5px]"
            onClick={(event) => {
              event.stopPropagation();
              void accept("now");
            }}
          >
            Accept into Now
          </button>
          <button
            type="button"
            className="bg-primary px-[15px] py-[8px] text-[12.5px] font-bold text-primary-foreground"
            onClick={(event) => {
              event.stopPropagation();
              void accept("next");
            }}
          >
            Accept into Next
          </button>
          <button
            type="button"
            className="border border-rule px-[13px] py-[8px] text-[12.5px]"
            onClick={(event) => {
              event.stopPropagation();
              void accept("later");
            }}
          >
            Accept into Later
          </button>
          {canDecline ? (
            <button
              type="button"
              className="border border-rule px-[13px] py-[8px] text-[12.5px] text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onToggleDecline(true);
              }}
            >
              Decline…
            </button>
          ) : (
            <button
              type="button"
              className="border border-rule px-[13px] py-[8px] text-[12.5px] text-muted-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setDeleteOpen(true);
              }}
            >
              Delete
            </button>
          )}
          <span className="ml-auto font-mono text-[11.5px] text-faint">
            {canDecline ? "⌘1 · ⌘2 · ⌘3 · ⌘\\" : "⌘1 · ⌘2 · ⌘3"}
          </span>
        </div>
      )}

      <TaskDeleteDialog
        open={deleteOpen}
        title={item.task.title}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          void deleteTask(item.task.id);
          setDeleteOpen(false);
        }}
      />
    </article>
  );
}

function HistoryRow({ item }: { item: InboxHistoryItem }) {
  const first = personFirstName(item.from.name);
  const statusLabel = item.status === "accepted" ? "Accepted" : "Declined";

  return (
    <div className="flex flex-col gap-[6px] border-b border-hair px-[24px] py-[16px]">
      <div className="text-[11px] tabular-nums text-faint">
        {statusLabel} · {historyDate(item.createdAt)}
      </div>
      <div className="text-[13.5px] leading-[1.45]">{item.title}</div>
      {item.status === "accepted" && item.bucket ? (
        <div className="text-[12px] text-muted-foreground">
          You put it in {item.bucket === "now" ? "Now" : item.bucket === "next" ? "Next" : "Later"}
        </div>
      ) : null}
      {item.status === "declined" && item.declineReason ? (
        <div className="border-l-2 border-hair pl-[10px] text-[12px] leading-[1.5] text-muted-foreground">
          “{item.declineReason}”
        </div>
      ) : null}
      {item.status === "declined" && !item.declineReason ? (
        <div className="text-[12px] text-muted-foreground">Declined to {first}</div>
      ) : null}
    </div>
  );
}

export function InboxRoute() {
  const { data, isLoading, isError } = useGetInboxQuery();
  const [acceptInbox] = useAcceptInboxItemMutation();
  const { open: paletteOpen } = useCommandPalette();
  const pending = data?.pending ?? [];
  const history = data?.history ?? [];
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const band = useViewportBand();

  useEffect(() => {
    if (pending.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !pending.some((item) => item.id === focusedId)) {
      setFocusedId(pending[0]!.id);
    }
  }, [focusedId, pending]);

  const active = pending.find((item) => item.id === focusedId) ?? pending[0];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || paletteOpen || isCommandPaletteBlocked()) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const action = inboxShortcutAction(event);
      if (!action || !active) {
        return;
      }

      event.preventDefault();
      if (action === "decline") {
        if (canDeclineInboxCard(active.kind)) {
          setDecliningId(active.id);
        }
        return;
      }

      void acceptInbox({ id: active.id, bucket: action });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [acceptInbox, active, paletteOpen]);

  if (isLoading) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (isError) {
    return (
      <p className="px-[32px] py-[24px] text-[14px] text-destructive">
        Could not load Inbox.
      </p>
    );
  }

  const managerName = pending.find((item) => item.kind === "assigned")?.from.name
    ?? history[0]?.from.name
    ?? null;

  const historyTitle = managerName
    ? `Recent from ${personFirstName(managerName)}`
    : "Recent from your manager";

  const historyPanel = (
    <aside className="flex min-h-0 flex-col bg-background">
      <div className="flex items-center gap-[10px] border-b border-hair px-[24px] py-[20px]">
        {managerName ? <Avatar name={managerName} /> : null}
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-faint">
          {historyTitle}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-[24px] py-[20px] text-[12.5px] leading-[1.5] text-faint">
            Everything they send waits here until you decide. They see the outcome,
            never the wait.
          </p>
        ) : (
          history.map((item) => <HistoryRow key={item.id} item={item} />)
        )}
      </div>
      <div className="mt-auto flex h-[30px] items-center border-t border-hair px-[24px] text-[11px] text-faint">
        Tasks you mark private never appear to a manager
      </div>
    </aside>
  );

  return (
    <div
      className={cn(
        "grid h-full min-h-0",
        band === "phone"
          ? "grid-cols-1"
          : "grid-cols-[minmax(0,1fr)_356px]",
      )}
    >
      <div className="min-h-0 overflow-y-auto border-r border-hair bg-card">
        {band === "phone" ? (
          <div className="flex justify-end border-b border-hair px-[16px] py-[10px]">
            <button
              type="button"
              className="text-[12.5px] font-bold text-foreground"
              onClick={() => setHistoryOpen(true)}
            >
              {historyTitle}
            </button>
          </div>
        ) : null}
        {pending.length === 0 ? (
          <p className="px-[16px] py-[48px] text-[14px] text-muted-foreground md:px-[32px]">
            Nothing here lands in your day until you accept it
          </p>
        ) : (
          pending.map((item) => (
            <InboxCard
              key={item.id}
              item={item}
              focused={item.id === focusedId}
              onFocus={() => setFocusedId(item.id)}
              declining={decliningId === item.id}
              onToggleDecline={(open) => setDecliningId(open ? item.id : null)}
            />
          ))
        )}
      </div>
      {band === "phone" ? (
        <InspectorSheet
          open={historyOpen}
          title={historyTitle}
          onClose={() => setHistoryOpen(false)}
        >
          {historyPanel}
        </InspectorSheet>
      ) : (
        historyPanel
      )}
    </div>
  );
}
