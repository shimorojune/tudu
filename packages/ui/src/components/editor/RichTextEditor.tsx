import { useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TaskDescriptionUploadFn } from "@/components/editor/taskDescriptionAttachments";
import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor";
import {
  plainTextToRichHtml,
  sanitizeRichTextHtml,
} from "./richTextHtml";
import {
  editorHtmlToJiraWiki,
  safeJiraWikiToEditorHtml,
} from "./wikiMarkup";

export type RichTextEditorMode = "html" | "jiraWiki";

export type RichTextEditorProps = {
  mode: RichTextEditorMode | "task";
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  taskAttachments?: {
    upload?: TaskDescriptionUploadFn;
  };
};

function normalizeMode(mode: RichTextEditorMode | "task"): RichTextEditorMode {
  return mode === "task" ? "html" : mode;
}

function emitChange(
  html: string,
  mode: RichTextEditorMode,
  onChange: (value: string) => void,
): string {
  if (mode === "jiraWiki") {
    const wiki = editorHtmlToJiraWiki(html);
    onChange(wiki);
    return wiki;
  }
  const sanitized = sanitizeRichTextHtml(html);
  onChange(sanitized);
  return sanitized;
}

export function RichTextEditor({
  mode,
  value,
  onChange,
  "aria-label": ariaLabel,
  readOnly = false,
  placeholder,
  className,
  taskAttachments,
}: RichTextEditorProps) {
  const normalizedMode = normalizeMode(mode);
  const lastEmittedRef = useRef(value);
  const parsed = useMemo(
    () =>
      normalizedMode === "jiraWiki"
        ? safeJiraWikiToEditorHtml(value)
        : { ok: true as const, html: plainTextToRichHtml(value), raw: value },
    [normalizedMode, value],
  );
  const fallback = normalizedMode === "jiraWiki" && !parsed.ok;
  const htmlValue = parsed.ok ? parsed.html : "";

  if (fallback) {
    return (
      <div className="space-y-[6px]">
        <p className="text-[11.5px] text-faint">Showing raw Jira wiki text.</p>
        <textarea
          value={value}
          readOnly={readOnly}
          rows={6}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={cn(
            "w-full resize-y border border-rule bg-transparent px-[10px] py-[8px]",
            "text-[12.5px] leading-[1.55] outline-none placeholder:text-faint",
            readOnly && "cursor-default text-muted-foreground",
            className,
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rich-text-editor min-h-[160px] w-full max-w-full border border-rule bg-card",
        readOnly && "opacity-80",
        className,
      )}
      data-testid="rich-text-editor"
    >
      <SimpleEditor
        contentHtml={htmlValue}
        readOnly={readOnly}
        placeholder={placeholder ?? "Start typing..."}
        ariaLabel={ariaLabel}
        className="rich-text-editor-tiptap"
        taskAttachments={taskAttachments}
        onChange={(html) => {
          if (readOnly) {
            return;
          }
          lastEmittedRef.current = emitChange(html, normalizedMode, onChange);
        }}
      />
    </div>
  );
}
