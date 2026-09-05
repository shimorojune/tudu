type PagePlaceholderProps = {
  title: string;
  note: string;
};

export function PagePlaceholder({ title, note }: PagePlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-[22px]">
      <h1 className="text-[28px] tracking-tight">{title}</h1>
      <p className="max-w-[520px] text-[14.5px] leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
