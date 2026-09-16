import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { fetchAttachmentBlobUrl, isTaskAttachmentSrc } from "@/lib/attachmentUrl";

export function AuthenticatedImageView({ node }: NodeViewProps) {
  const src = typeof node.attrs.src === "string" ? node.attrs.src : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      return;
    }
    if (!isTaskAttachmentSrc(src)) {
      setResolvedSrc(src);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void fetchAttachmentBlobUrl(src)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setResolvedSrc(url);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (failed) {
    return (
      <NodeViewWrapper className="tudu-attachment-image tudu-attachment-image-failed">
        <span className="text-[12px] text-muted-foreground">[image unavailable]</span>
      </NodeViewWrapper>
    );
  }

  if (!resolvedSrc) {
    return (
      <NodeViewWrapper className="tudu-attachment-image tudu-attachment-image-loading">
        <span className="text-[12px] text-faint">Loading image…</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="tudu-attachment-image">
      <img src={resolvedSrc} alt={alt} className="tudu-attachment-media" />
    </NodeViewWrapper>
  );
}
