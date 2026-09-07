export type TodayFirstRunProps = {
  onAddFirst: () => void;
};

const points = [
  <>
    Use <span className="font-semibold">Add task</span> on a bucket to choose
    where it lands before you type. Order is the only priority there is.
  </>,
  <>
    Paste a JIRA key into a task, or press L on a task, to tether it to an
    issue. Your assigned issues are already in the middle pane.
  </>,
  <>
    Anything unfinished comes with you tomorrow, with a dot for each day it has
    been carried.
  </>,
];

export function TodayFirstRun({ onAddFirst }: TodayFirstRunProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[26px] bg-card px-[60px]">
      <div className="max-w-[460px] space-y-[16px]">
        <h2 className="text-[23px] tracking-[-0.025em]">
          Nothing here yet. Good.
        </h2>
        <p className="max-w-[420px] text-[14px] leading-[1.6] text-muted-foreground">
          Three things to know, then you can forget this screen.
        </p>
        <ol className="grid list-none grid-cols-[26px_minmax(0,1fr)] gap-x-[14px] gap-y-[16px]">
          {points.map((point, index) => (
            <li key={index} className="contents">
              <span className="pt-[2px] text-[13px] font-extrabold tabular-nums">
                {index + 1}
              </span>
              <span className="text-[14px] leading-[1.6]">{point}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex max-w-[460px] items-center gap-[12px] border-t border-hair pt-[22px]">
        <button
          type="button"
          className="border border-foreground px-[14px] py-[9px] text-[13px] font-semibold"
          onClick={onAddFirst}
        >
          Add my first task
        </button>
        <span className="text-[12.5px] text-faint">Press N</span>
      </div>
    </div>
  );
}
