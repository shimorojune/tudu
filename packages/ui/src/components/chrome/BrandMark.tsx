export type BrandMarkProps = {
  showUnreadIndicator?: boolean;
};

export function BrandMark({ showUnreadIndicator = false }: BrandMarkProps) {
  return (
    <div className="flex items-center gap-[11px]">
      <div className="relative grid size-[23px] place-items-center bg-foreground">
        <span className="text-[14px] font-extrabold leading-none tracking-[-0.04em] text-card">
          T
        </span>
        {showUnreadIndicator ? (
          <div className="absolute -bottom-[2px] -right-[2px] size-[6px] bg-primary" />
        ) : null}
      </div>
      <span className="hidden text-[16.5px] font-extrabold tracking-[-0.03em] xl:inline">
        Tudu
      </span>
    </div>
  );
}
