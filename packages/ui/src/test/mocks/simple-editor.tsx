import { useEffect, useRef } from "react";

type MockSimpleEditorProps = {
  contentHtml?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

export function SimpleEditor({
  contentHtml = "<p></p>",
  onChange,
  readOnly = false,
  placeholder,
  ariaLabel = "Rich text editor",
}: MockSimpleEditorProps) {
  const htmlRef = useRef(contentHtml);

  useEffect(() => {
    htmlRef.current = contentHtml;
  }, [contentHtml]);

  return (
    <div data-testid="tiptap-simple-editor">
      {!readOnly ? <div data-testid="tiptap-toolbar" /> : null}
      <div
        role="textbox"
        aria-label={ariaLabel}
        aria-disabled={readOnly ? "true" : undefined}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={(event) => {
          if (readOnly) {
            return;
          }
          const text = event.currentTarget.textContent ?? "";
          htmlRef.current = `<p>${text}</p>`;
          onChange?.(htmlRef.current);
        }}
        dangerouslySetInnerHTML={{ __html: contentHtml }}
      />
    </div>
  );
}
