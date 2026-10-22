/** The four things Getting started asks for, in the card's order. */
export const GETTING_STARTED_STEPS = ['name', 'task', 'theme', 'jira'] as const;
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number];

export type GettingStartedDone = Record<GettingStartedStep, boolean>;

/** Where a person stands with Getting started, as `/api/me` reads it. */
export interface GettingStarted {
  /** The card is still to show: neither hidden nor finished. */
  open: boolean;
  done: GettingStartedDone;
}

/** What `POST /api/me/getting-started` takes: a theme was picked, or the card was hidden (or finished). */
export type GettingStartedRecord = { theme: true } | { hidden: true };

/** The card's rows: label and second line. */
export const GETTING_STARTED_WORDS: Record<GettingStartedStep, { label: string; sub: string }> = {
  name: { label: 'Add your name and photo', sub: 'So people know it’s you' },
  task: { label: 'Write your first task', sub: 'It stays on Today until you cross it off' },
  theme: { label: 'Pick light or dark', sub: 'Or let it follow your computer' },
  jira: { label: 'Bring your Jira issues', sub: 'Optional' },
};

/** The toast after × (Hide). */
export const GETTING_STARTED_HIDDEN = 'Hidden. Everything it pointed to is in Settings.';

/** How many of the four are done. */
export function doneCount(done: GettingStartedDone): number {
  return GETTING_STARTED_STEPS.filter((k) => done[k]).length;
}

/** All four done: the card says "You're set" and leaves. */
export function allDone(done: GettingStartedDone): boolean {
  return doneCount(done) === GETTING_STARTED_STEPS.length;
}

/** The first word of a name ("Rohit Raj" gives Rohit); empty when there is no name (no stand-in, unlike firstName). */
export function givenName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "Welcome to Tudu, Rohit." or "Welcome to Tudu." without a name; a joined space names itself instead of Tudu. */
export function welcomeTitle(name: string | null | undefined, place = 'Tudu'): string {
  const first = givenName(name);
  return first ? `Welcome to ${place}, ${first}.` : `Welcome to ${place}.`;
}

/**
 * Who is in a space besides you: "Meera and 17 others are here.", "Meera and one other are here.", "Meera is here.".
 * `others` counts everyone else, Meera included. Without a name to give, it counts them.
 */
export function peopleHere(host: string | null | undefined, others: number): string {
  const first = givenName(host);
  if (others <= 0) return 'It’s just you for now.';
  if (!first) return others === 1 ? 'One other person is here.' : `${others} other people are here.`;
  if (others === 1) return `${first} is here.`;
  if (others === 2) return `${first} and one other are here.`;
  return `${first} and ${others - 1} others are here.`;
}

/** The toast on landing in a space you just joined. */
export function joinedToast(space: string, host: string | null | undefined, others: number): string {
  return `You joined ${space}. ${peopleHere(host, others)}`;
}

/** The toast for a returning person: "Welcome back, Rohit." or "Welcome back.". */
export function welcomeBack(name: string | null | undefined): string {
  const first = givenName(name);
  return first ? `Welcome back, ${first}.` : 'Welcome back.';
}
