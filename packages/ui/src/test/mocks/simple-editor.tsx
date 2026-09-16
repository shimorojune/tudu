import { useEffect, useState } from "react";

type MockSimpleEditorProps = {
  contentHtml?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
};

function htmlToPlain(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export function SimpleEditor({
  contentHtml = "<p></p>",
  onChange,
  readOnly = false,
  placeholder,
  ariaLabel = "Rich text editor",
}: MockSimpleEditorProps) {
  const [plain, setPlain] = useState(() => htmlToPlain(contentHtml));

  useEffect(() => {
    setPlain(htmlToPlain(contentHtml));
  }, [contentHtml]);

  return (
    <div data-testid="tiptap-simple-editor">
      {!readOnly ? <div data-testid="tiptap-toolbar" /> : null}
      <textarea
        role="textbox"
        aria-label={ariaLabel}
        readOnly={readOnly}
        placeholder={placeholder}
        value={plain}
        onChange={(event) => {
          if (readOnly) {
            return;
          }
          const nextPlain = event.target.value;
          setPlain(nextPlain);
          onChange?.(nextPlain.length > 0 ? `<p>${nextPlain}</p>` : "<p></p>");
        }}
      />
    </div>
  );
}
