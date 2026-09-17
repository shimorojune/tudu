import type { UpdatePhase } from "@tudu/ui/update";

export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const UPDATE_CHECK_FOCUS_DEBOUNCE_MS = 30_000;

export function shouldRunUpdateCheck(
  phase: UpdatePhase,
  inFlight: boolean,
): boolean {
  if (inFlight) {
    return false;
  }
  if (phase === "downloading" || phase === "ready") {
    return false;
  }
  return true;
}

export function shouldApplyUpdate(
  version: string,
  dismissedVersion: string | undefined,
): boolean {
  if (!dismissedVersion) {
    return true;
  }
  return version !== dismissedVersion;
}

export function shouldNotifyForVersion(
  version: string,
  dismissedVersion: string | undefined,
  lastNotifiedVersion: string | undefined,
): boolean {
  if (!shouldApplyUpdate(version, dismissedVersion)) {
    return false;
  }
  if (lastNotifiedVersion === version) {
    return false;
  }
  return true;
}

export function shouldRunFocusCheck(
  lastCheckAtMs: number | undefined,
  nowMs: number,
): boolean {
  if (lastCheckAtMs == null) {
    return true;
  }
  return nowMs - lastCheckAtMs >= UPDATE_CHECK_FOCUS_DEBOUNCE_MS;
}
