const PREFIX = "tudu.rollover.";

function key(name: string) {
  return `${PREFIX}${name}`;
}

export function readLastRun(): string | null {
  return localStorage.getItem(key("lastRunEffectiveDay"));
}

export function writeLastRun(iso: string) {
  localStorage.setItem(key("lastRunEffectiveDay"), iso);
}

export function isRecapDismissed(iso: string): boolean {
  return localStorage.getItem(key(`dismissRecap:${iso}`)) === "1";
}

export function dismissRecap(iso: string) {
  localStorage.setItem(key(`dismissRecap:${iso}`), "1");
}

export function isMidnightDismissed(iso: string): boolean {
  return localStorage.getItem(key(`dismissMidnight:${iso}`)) === "1";
}

export function dismissMidnight(iso: string) {
  localStorage.setItem(key(`dismissMidnight:${iso}`), "1");
}

export function readDayOverride(): string | null {
  return localStorage.getItem(key("dayOverride"));
}

export function writeDayOverride(iso: string | null) {
  if (iso === null) {
    localStorage.removeItem(key("dayOverride"));
    return;
  }
  localStorage.setItem(key("dayOverride"), iso);
}
