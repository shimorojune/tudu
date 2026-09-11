type SettingsStubPanelProps = {
  title: string;
};

export function SettingsStubPanel({ title }: SettingsStubPanelProps) {
  return (
    <div className="flex h-full flex-col px-[30px] py-[26px]">
      <h1 className="text-[19px] font-extrabold tracking-[-0.018em]">{title}</h1>
      <p className="mt-[14px] max-w-[480px] text-[14px] leading-relaxed text-muted-foreground">
        This page is not in this version yet.
      </p>
    </div>
  );
}
