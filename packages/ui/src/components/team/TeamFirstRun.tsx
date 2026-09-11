import type { FormEvent } from "react";
import { TeamInviteForm } from "@/components/team/TeamInviteForm";

const points = [
  "Add someone by work email",
  "They confirm before anything is shared",
  "Then you can open their day and send work to Inbox",
];

export type TeamFirstRunProps = {
  email: string;
  error: string | null;
  sending: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function TeamFirstRun({
  email,
  error,
  sending,
  onEmailChange,
  onSubmit,
}: TeamFirstRunProps) {
  return (
    <div className="bg-card px-[16px] py-[32px] md:px-[32px]">
      <div className="max-w-[460px] space-y-[16px]">
        <h2 className="text-[23px] tracking-[-0.025em]">
          Nobody on your team yet.
        </h2>
        <ol className="grid list-none grid-cols-[26px_minmax(0,1fr)] gap-x-[14px] gap-y-[16px]">
          {points.map((point, index) => (
            <li key={point} className="contents">
              <span className="pt-[2px] text-[13px] font-extrabold tabular-nums">
                {index + 1}
              </span>
              <span className="text-[14px] leading-[1.6]">{point}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-[22px] max-w-[460px] border-t border-hair pt-[22px]">
        <TeamInviteForm
          email={email}
          error={error}
          sending={sending}
          onEmailChange={onEmailChange}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}
