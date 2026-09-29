import { Link2 } from "lucide-react";
import type { MetaSegment } from "@/lib/taskMeta";
import { cn } from "@/lib/utils";

export type TaskMetaSegmentsProps = {
  segments: MetaSegment[];
  className?: string;
};

export function TaskMetaSegments({ segments }: TaskMetaSegmentsProps) {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "dot") {
          return (
            <span key={`dot-${index}`} className="text-ghost" aria-hidden>
              ·
            </span>
          );
        }
        if (segment.kind === "jira") {
          return (
            <span
              key={`jira-${index}`}
              className="inline-flex items-center gap-[5px] font-mono text-primary-text"
            >
              <Link2 size={12} strokeWidth={2} aria-hidden />
              {segment.keys.map((link, keyIndex) => (
                <span key={link.key} className="inline-flex items-center gap-[5px]">
                  {keyIndex > 0 ? <span className="text-ghost">,</span> : null}
                  <a
                    href={link.browseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-text hover:text-primary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {link.key}
                  </a>
                </span>
              ))}
            </span>
          );
        }
        return (
          <span
            key={`text-${index}`}
            className={cn(
              segment.emphasis && "font-bold text-foreground",
              segment.accent && "font-bold text-primary-text",
            )}
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
