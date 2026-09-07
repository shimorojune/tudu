import { useState, type MouseEvent } from "react";
import { useGetLinkPreviewQuery } from "@tudu/store";
import { linkHostname, linkifyText } from "@/lib/linkify";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type LinkifiedTextProps = {
  text: string;
  className?: string;
};

function openUrl(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}

function PreviewBody({ href }: { href: string }) {
  const { data, isFetching } = useGetLinkPreviewQuery(href);
  const [imageFailed, setImageFailed] = useState(false);

  const title = data?.title;
  const description = data?.description;
  const imageUrl = !imageFailed ? data?.imageUrl : null;
  const site = data?.siteName || data?.hostname || linkHostname(href);
  const loaded = Boolean(title || description || imageUrl);

  return (
    <div
      className="w-[min(320px,calc(100vw-32px))]"
      onClick={(event) => event.stopPropagation()}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="max-h-[140px] w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}

      <div className="p-[12px]">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
          {site}
        </p>

        {isFetching && !loaded ? (
          <div className="mt-[10px] flex flex-col gap-[8px]" aria-busy="true">
            <span className="h-[12px] w-[80%] bg-foreground/[0.08]" />
            <span className="h-[12px] w-full bg-foreground/[0.06]" />
            <span className="h-[12px] w-[60%] bg-foreground/[0.06]" />
          </div>
        ) : (
          <>
            {title ? (
              <p className="mt-[6px] text-[14px] font-semibold leading-[1.35]">
                {title}
              </p>
            ) : null}
            {description ? (
              <p className="mt-[6px] line-clamp-3 text-[12.5px] leading-[1.45] text-muted-foreground">
                {description}
              </p>
            ) : null}
            {!title && !description ? (
              <p className="mt-[6px] break-all text-[12.5px] leading-[1.45] text-muted-foreground">
                {href}
              </p>
            ) : null}
          </>
        )}

        <button
          type="button"
          className="mt-[10px] border border-rule px-[10px] py-[5px] text-[12px] font-bold"
          onClick={() => openUrl(href)}
        >
          Open
        </button>
      </div>
    </div>
  );
}

function LinkPreview({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.metaKey || event.ctrlKey) {
      openUrl(href);
      return;
    }
    setOpen(true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <a
          href={href}
          className={cn(
            "underline-offset-2 [text-decoration-line:underline] [.line-through_&]:[text-decoration-line:underline_line-through] [.line-through_&]:decoration-[1.5px]",
            className,
          )}
          onClick={handleClick}
        >
          {children}
        </a>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto border-rule p-0"
        onClick={(event) => event.stopPropagation()}
      >
        {open ? <PreviewBody href={href} /> : null}
      </PopoverContent>
    </Popover>
  );
}

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const segments = linkifyText(text);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index) =>
        segment.kind === "link" ? (
          <LinkPreview key={`link-${index}`} href={segment.href}>
            {segment.value}
          </LinkPreview>
        ) : (
          <span key={`text-${index}`}>{segment.value}</span>
        ),
      )}
    </span>
  );
}
