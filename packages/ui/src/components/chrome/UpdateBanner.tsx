import { X } from "lucide-react";
import { useUpdate } from "@/providers/UpdateContext";

const MAX_NOTES_LEN = 240;

function formatNotes(notes?: string) {
  const trimmed = notes?.trim();
  if (!trimmed || trimmed.length > MAX_NOTES_LEN) {
    return null;
  }
  return trimmed;
}

function VersionLabel({
  version,
  releaseUrl,
  openRelease,
}: {
  version: string;
  releaseUrl?: string;
  openRelease?: () => void;
}) {
  if (!releaseUrl) {
    return <>{version}</>;
  }

  const linkClass =
    "font-bold text-foreground underline-offset-2 hover:underline";

  if (openRelease) {
    return (
      <a
        href={releaseUrl}
        className={linkClass}
        onClick={(event) => {
          event.preventDefault();
          openRelease();
        }}
      >
        {version}
      </a>
    );
  }

  return (
    <a
      href={releaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {version}
    </a>
  );
}

export function UpdateBanner() {
  const {
    phase,
    version,
    releaseUrl,
    notes,
    progress,
    dismiss,
    install,
    restart,
    openRelease,
  } = useUpdate();

  if (phase === "hidden" || !version) {
    return null;
  }

  const formattedNotes = formatNotes(notes);

  let message = "";
  let primaryLabel = "";
  let primaryAction = () => {};
  let secondaryLabel = "Later";
  let secondaryAction = dismiss;
  let dismissLabel = "Dismiss update banner";

  const showVersionLink = phase === "available";

  if (phase === "available") {
    primaryLabel = "Update";
    primaryAction = install;
  } else if (phase === "downloading") {
    message =
      progress !== undefined
        ? `Installing update… ${progress}%`
        : "Installing update…";
  } else if (phase === "ready") {
    message = "Restart Tudu to use the update.";
    primaryLabel = "Restart";
    primaryAction = restart;
    dismissLabel = "Dismiss restart banner";
  }

  return (
    <div
      className="flex items-center gap-[16px] border-b-2 border-foreground bg-card px-[28px] py-[13px]"
      role="status"
    >
      <span
        className="flex size-[16px] shrink-0 items-center justify-center border border-foreground text-foreground"
        aria-hidden
      >
        <span className="size-[6px] bg-foreground" style={{ borderRadius: "50%" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[1.45] text-muted-foreground">
          {showVersionLink ? (
            <span className="font-bold text-foreground">
              Version{" "}
              <VersionLabel
                version={version}
                releaseUrl={releaseUrl}
                openRelease={openRelease}
              />{" "}
              is ready.
            </span>
          ) : (
            <span className="font-bold text-foreground">{message}</span>
          )}
          {formattedNotes ? (
            <span className="mt-[4px] block text-[12.5px]">{formattedNotes}</span>
          ) : null}
        </p>
      </div>
      {phase !== "downloading" ? (
        <div className="flex shrink-0 items-center gap-[8px]">
          <button
            type="button"
            className="bg-primary px-[12px] py-[6px] text-[12.5px] font-bold text-primary-foreground"
            onClick={primaryAction}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className="border border-rule px-[12px] py-[5px] text-[12.5px] text-muted-foreground"
            onClick={secondaryAction}
          >
            {secondaryLabel}
          </button>
        </div>
      ) : null}
      {phase !== "downloading" ? (
        <button
          type="button"
          className="shrink-0 text-ghost"
          aria-label={dismissLabel}
          onClick={dismiss}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
