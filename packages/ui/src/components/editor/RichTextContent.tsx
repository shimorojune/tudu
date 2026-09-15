import { cn } from "@/lib/utils";
import { sanitizeRichTextHtml } from "./richTextHtml";

export type RichTextContentProps = {
  value: string;
  className?: string;
};

export function RichTextContent({ value, className }: RichTextContentProps) {
  const html = sanitizeRichTextHtml(value);
  if (!html) {
    return null;
  }

  return (
    <div
      className={cn(
        "text-[13px] leading-[1.5] [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-hair [&_blockquote]:pl-[10px] [&_code]:bg-background [&_code]:px-[3px] [&_li]:ml-[18px] [&_ol]:list-decimal [&_p+p]:mt-[8px] [&_pre]:border [&_pre]:border-hair [&_pre]:p-[8px] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-hair [&_td]:p-[5px] [&_th]:border [&_th]:border-hair [&_th]:p-[5px] [&_ul]:list-disc",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
