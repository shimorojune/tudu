import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";

export type TeamInviteFormProps = {
  email: string;
  error: string | null;
  sending: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel?: () => void;
};

export function TeamInviteForm({
  email,
  error,
  sending,
  onEmailChange,
  onSubmit,
  onCancel,
}: TeamInviteFormProps) {
  return (
    <form className="flex flex-col gap-[8px]" onSubmit={(event) => void onSubmit(event)}>
      <div className="flex flex-wrap items-center gap-[8px]">
        <input
          type="email"
          required
          value={email}
          placeholder="name@company.com"
          aria-label="Work email"
          className="w-[240px] border border-rule bg-card px-[11px] py-[7px] text-[13px] outline-none"
          onChange={(event) => onEmailChange(event.target.value)}
        />
        <Button
          type="submit"
          loading={sending}
          className="h-auto bg-foreground px-[14px] py-[7px] text-[12px] font-bold text-card"
        >
          Send invite
        </Button>
        {onCancel ? (
          <button
            type="button"
            className="text-[12.5px] text-muted-foreground"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="text-[12.5px] text-destructive">{error}</p>
      ) : null}
    </form>
  );
}
