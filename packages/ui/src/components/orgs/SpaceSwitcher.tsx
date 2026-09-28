import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Link2, Plus } from "lucide-react";
import type { SpaceListItem } from "@tudu/shared";
import { SPACE_COLOR_HEX } from "@tudu/shared";
import { useListSpacesQuery } from "@tudu/store";
import { CreateOrgDialog } from "@/components/orgs/CreateOrgDialog";
import { JoinWithLinkDialog } from "@/components/orgs/JoinWithLinkDialog";
import { useEffectiveOrgSlug } from "@/hooks/useSpaceContext";
import { spaceShortcutHint } from "@/hooks/useSpaceShortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function spaceSubtitle(space: SpaceListItem): string {
  if (space.kind === "personal") {
    return "Just you";
  }
  const people =
    space.memberCount !== undefined
      ? `${space.memberCount} people`
      : "Organization";
  if (space.role === "owner") {
    return `Organization · you own it`;
  }
  return `Organization · ${people}`;
}

function SpaceAvatar({
  space,
  className,
}: {
  space: SpaceListItem;
  className?: string;
}) {
  const isOrg = space.kind === "org" && space.color;
  return (
    <span
      className={cn(
        "grid place-items-center font-extrabold",
        isOrg ? "text-primary-foreground" : "border border-rule bg-card text-foreground",
        className,
      )}
      style={
        isOrg
          ? { backgroundColor: SPACE_COLOR_HEX[space.color!] }
          : undefined
      }
    >
      {space.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function SpaceSwitcher() {
  const navigate = useNavigate();
  const effectiveSlug = useEffectiveOrgSlug();
  const { data } = useListSpacesQuery();
  const spaces = data?.spaces ?? [{ kind: "personal" as const, name: "Personal" }];
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const active = useMemo(() => {
    if (effectiveSlug) {
      return (
        spaces.find(
          (space) => space.kind === "org" && space.slug === effectiveSlug,
        ) ?? spaces[0]
      );
    }
    return spaces.find((space) => space.kind === "personal") ?? spaces[0];
  }, [effectiveSlug, spaces]);

  const activeUnread =
    active.kind === "org" && (active.unreadCount ?? 0) > 0
      ? active.unreadCount
      : null;

  function openAdmin() {
    if (active.kind === "org" && active.slug && active.role === "owner") {
      void navigate({
        to: "/o/$orgSlug/admin",
        params: { orgSlug: active.slug },
      });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch space"
            className="flex max-w-[44px] items-center gap-[8px] xl:max-w-[220px]"
          >
            <div className="relative shrink-0">
              <SpaceAvatar
                space={active}
                className="size-[23px] text-[11px] xl:size-[28px] xl:text-[13px]"
              />
              {activeUnread ? (
                <div className="absolute -bottom-[2px] -right-[2px] size-[6px] bg-primary" />
              ) : null}
            </div>
            <span className="hidden min-w-0 flex-col truncate xl:flex">
              <span className="truncate text-[13.5px] font-bold tracking-[-0.01em]">
                {active.name}
              </span>
              <span className="truncate text-[11px] text-faint">
                {spaceSubtitle(active)}
              </span>
            </span>
            <ChevronDown className="hidden size-[14px] text-muted-foreground xl:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px]">
          <DropdownMenuLabel>Switch space</DropdownMenuLabel>
          {spaces.map((space, index) => {
            const selected =
              space.kind === "personal"
                ? !effectiveSlug
                : space.slug === effectiveSlug;
            const unread =
              space.kind === "org" && (space.unreadCount ?? 0) > 0
                ? space.unreadCount
                : null;
            return (
              <DropdownMenuItem key={space.slug ?? "personal"} asChild>
                <Link
                  to={
                    space.kind === "org" && space.slug
                      ? "/o/$orgSlug"
                      : "/"
                  }
                  params={
                    space.kind === "org" && space.slug
                      ? { orgSlug: space.slug }
                      : undefined
                  }
                  className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0"
                >
                  <SpaceAvatar space={space} className="size-7 text-[13px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">
                      {space.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-faint">
                      {spaceSubtitle(space)}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    {unread ? (
                      <span className="bg-primary px-[5px] py-px text-[11px] font-extrabold tabular-nums text-primary-foreground">
                        {unread}
                      </span>
                    ) : null}
                    {selected ? (
                      <Check className="size-[13px] shrink-0" strokeWidth={3} />
                    ) : null}
                    <span className="min-w-[52px] shrink-0 whitespace-nowrap text-right font-mono text-[11px] text-faint">
                      {spaceShortcutHint(index)}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-[14px]" />
            New organization
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setJoinOpen(true)}>
            <Link2 className="size-[14px]" />
            Join with a link
          </DropdownMenuItem>
          {active.kind === "org" && active.role === "owner" && active.slug ? (
            <DropdownMenuItem onSelect={openAdmin}>
              Admin panel
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      <JoinWithLinkDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </>
  );
}
