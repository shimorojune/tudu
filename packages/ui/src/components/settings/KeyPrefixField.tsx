import { useState } from "react";
import { keyPrefixSchema } from "@tudu/shared";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type KeyPrefixFieldProps = {
  value: string;
  locked: boolean;
  onSave: (prefix: string) => Promise<void>;
  label?: string;
  description?: string;
};

export function KeyPrefixField({
  value,
  locked,
  onSave,
  label = "Task ID prefix",
  description = "Two to five uppercase letters. Locked after the first task in this space.",
}: KeyPrefixFieldProps) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = draft.trim().toUpperCase();
  const parsed = keyPrefixSchema.safeParse(trimmed);
  const canSave = !locked && parsed.success && trimmed !== value;

  async function handleSave() {
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid prefix");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed.data);
    } catch (caught) {
      const message =
        caught &&
        typeof caught === "object" &&
        "data" in caught &&
        typeof (caught as { data?: { error?: string } }).data?.error === "string"
          ? (caught as { data: { error: string } }).data.error
          : "Could not save prefix";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-faint">
        {label}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{description}</p>
      <div className="flex max-w-[220px] items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          disabled={locked || busy}
          maxLength={5}
          className="font-mono uppercase"
          aria-label={label}
        />
        <Button
          type="button"
          size="sm"
          disabled={!canSave || busy}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </div>
      {locked ? (
        <p className="text-[12px] text-faint">Prefix is locked for this space.</p>
      ) : null}
      {error ? <p className="text-[12px] text-primary-text">{error}</p> : null}
    </div>
  );
}
