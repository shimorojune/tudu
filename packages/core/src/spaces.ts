import { z } from 'zod';

/** The muted swatches a team space can take, in the order the picker shows them. No brand red. */
export const SPACE_COLORS = [
  '#3d5a80',
  '#4e7a6b',
  '#5a7a4e',
  '#7a6b3d',
  '#a0613d',
  '#7a4e4e',
  '#7a4e7e',
  '#5a5f6b',
] as const;

/** The colours people's marks take, given once at first sign-in. Ink is never one of them: ink means you. */
export const PERSON_COLORS = [
  '#3d5a80',
  '#5b7553',
  '#8a5a00',
  '#7a4e7a',
  '#2f6f6f',
  '#a0522d',
  '#4a6670',
  '#6b5b3e',
] as const;

/** A person's colour from their id: stable, spread over the palette. */
export function personColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length]!;
}

export const SPACE_NAME_MAX = 40;
export const spaceNameSchema = z
  .string()
  .trim()
  .min(1, 'A space needs a name.')
  .max(SPACE_NAME_MAX, 'That name is too long.');
export const spaceColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Not a colour.');

export const PERSON_NAME_MAX = 80;
export const personNameSchema = z
  .string()
  .trim()
  .min(1, 'Your name can’t be empty.')
  .max(PERSON_NAME_MAX, 'That name is too long.');

/** A photo can be up to this big before it is shrunk on the way up. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** The letters on a space's tile: "Northwind" → N, "Design team" → DT. */
export function spaceInitials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length > 1 ? w[0]![0]! + w[1]![0]! : w[0]!.slice(0, 1)).toUpperCase();
}

/** The letters of a name only, upper case. */
function letters(s: string): string {
  return s.toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * A task prefix from a space's name: two words give their initials ("Design team" → DT); one word gives its first
 * letter and the one past its middle ("Northwind" → NW, "Platform" → PF, "Home" → HM). A prefix already taken
 * grows a letter from the name, then a number, so two spaces never share one.
 */
export function spacePrefix(name: string, taken: string[] = []): string {
  const words = name.split(/\s+/).map(letters).filter(Boolean);
  let base: string;
  if (!words.length) base = 'SP';
  else if (words.length >= 2) base = words[0]![0]! + words[1]![0]!;
  else {
    const w = words[0]!;
    base = w.length === 1 ? w + 'X' : w[0]! + w[Math.ceil(w.length / 2)]!;
  }
  const have = new Set(taken.map((t) => t.toUpperCase()));
  if (!have.has(base)) return base;
  const rest = letters(name).slice(words.length >= 2 ? 1 : 1);
  let grown = base;
  for (const ch of rest) {
    if (grown.length >= 5) break;
    if (grown.includes(ch) && grown.length < 3) continue;
    grown += ch;
    if (!have.has(grown)) return grown;
  }
  for (let n = 2; n < 100; n++) if (!have.has(base + n)) return base + n;
  return base;
}

/** Parts of the address that are never a space's slug. */
export const RESERVED_SLUGS = new Set([
  'me',
  'all',
  't',
  'kit',
  'quick-add',
  'sign-in',
  'join',
  'api',
  'more',
  'inbox',
  'week',
  'backlog',
  'people',
  'settings',
  'today',
  'search',
  'health',
]);

/** The address of a space from its name: "Northwind" → northwind, "Design team" → design-team; a clash gets -2. */
export function spaceSlug(name: string, taken: string[] = []): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'space';
  const have = new Set(taken.map((t) => t.toLowerCase()));
  const free = (s: string) => !have.has(s) && !RESERVED_SLUGS.has(s);
  if (free(base)) return base;
  for (let n = 2; n < 1000; n++) if (free(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** The slug Personal answers to in the address. */
export const PERSONAL_SLUG = 'me';

/** "NW-12" as its parts, or null when it is not a task ref. */
export function parseRef(ref: string): { prefix: string; number: number } | null {
  const m = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(ref.trim());
  return m ? { prefix: m[1]!.toUpperCase(), number: Number(m[2]) } : null;
}

/** The quiet line under a space's name: "Just you", "5 people". */
export function membersWords(count: number): string {
  return count <= 1 ? 'Just you' : `${count} people`;
}

/** Invites work this long. */
export const INVITE_DAYS = 7;

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A space as `/api/me` lists it. */
export interface SpaceSummary {
  id: string;
  kind: 'personal' | 'team';
  name: string;
  color: string | null;
  role: 'admin' | 'member';
  /** The part of the address: `me` for Personal, the slug for a team space. */
  slug: string;
  /** The task ID prefix, "ME" or "NW". */
  prefix: string;
  /** How many people are in it, you included. */
  members: number;
  /** What waits in its Inbox for you: requests to answer, and updates not read. */
  inbox: { toAnswer: number; unread: number };
  /** Slugs it answered to before a rename: an old address still lands here. */
  oldSlugs?: string[];
  /** You came in by an invite (a team space you did not make), and who sent it, when they are still around. */
  joined?: { by: string | null };
}

/** One member of a space. */
export interface Member {
  id: string;
  name: string;
  email: string;
  color: string | null;
  /** Their photo's address, or null for initials. */
  image?: string | null;
  role: 'admin' | 'member';
  joinedAt: string;
}

/** An invite waiting to be taken up. */
export interface Invite {
  id: string;
  email: string;
  role: 'admin' | 'member';
  sentAt: string;
  invitedBy: { id: string; name: string } | null;
}

export interface MembersResponse {
  members: Member[];
  invites: Invite[];
}

/** What inviting an address came to. */
export type InviteOutcome = 'sent' | 'resent' | 'member';

export interface InviteResponse {
  results: Array<{ email: string; outcome: InviteOutcome }>;
  invites: Invite[];
}

/** What a join link says before it is used. */
export interface JoinResponse {
  space: { id: string; name: string; color: string | null; slug: string; initials: string };
  from: { name: string } | null;
  count: number;
  people: Array<{ id: string; name: string; color: string | null; initials: string }>;
  email: string;
  /** `open` can be joined; the rest cannot. */
  state: 'open' | 'expired' | 'cancelled' | 'spent';
  /** The signed-in person, if any: whether they are already in, and whether the invite is theirs. */
  you: { member: boolean; matches: boolean } | null;
}

/** A space's members changed (someone joined, was invited, a space was made): read `/api/me` and the members again. */
export interface MembersChangedEvent {
  spaceId: string;
}
export const MEMBERS_CHANGED = 'members.changed';

/** The space itself changed (its name, colour or address): read `/api/me` again. */
export interface SpaceChangedEvent {
  spaceId: string;
}
export const SPACE_CHANGED = 'space.changed';

/** You are no longer in a space: it was deleted, you were removed, or you left it (in another tab). */
export interface SpaceGoneEvent {
  spaceId: string;
  name: string;
  how: 'deleted' | 'removed' | 'left';
  /** Who did it, for "Northwind was deleted by Rohit." */
  by: string | null;
}
export const SPACE_GONE = 'space.gone';

/** What happened, for the toast on Personal: "Northwind was deleted by Rohit." */
export function goneWords(e: Pick<SpaceGoneEvent, 'name' | 'how' | 'by'>): string {
  if (e.how === 'left') return `You left ${e.name}.`;
  const by = e.by ? ` by ${e.by}` : '';
  return e.how === 'deleted' ? `${e.name} was deleted${by}.` : `You were removed from ${e.name}${by}.`;
}

/** Who may do what in a space, from the asker's role and everyone's. */
export interface SpaceRules {
  /** Rename and recolour the space, change roles, remove people, delete the space. */
  admin: boolean;
  /** Why Leave can't happen yet, or null when it can. */
  leaveBlock: 'personal' | 'last-admin' | 'last-person' | null;
}

export function spaceRules(
  space: { kind: 'personal' | 'team'; role: 'admin' | 'member' },
  members: Array<{ id: string; role: 'admin' | 'member' }>,
  you: string,
): SpaceRules {
  const admin = space.kind === 'team' && space.role === 'admin';
  let leaveBlock: SpaceRules['leaveBlock'] = null;
  if (space.kind === 'personal') leaveBlock = 'personal';
  else if (members.filter((m) => m.id !== you).length === 0) leaveBlock = 'last-person';
  else if (space.role === 'admin' && !members.some((m) => m.id !== you && m.role === 'admin'))
    leaveBlock = 'last-admin';
  return { admin, leaveBlock };
}

/** True when this member's role may change: never your own, never the last admin to member. */
export function canChangeRole(
  members: Array<{ id: string; role: 'admin' | 'member' }>,
  you: string,
  target: string,
  to: 'admin' | 'member',
): boolean {
  if (target === you) return false;
  const t = members.find((m) => m.id === target);
  if (!t || t.role === to) return false;
  if (to === 'member' && members.filter((m) => m.role === 'admin').length <= 1) return false;
  return true;
}

/** The line under a space's name in Settings: "Just you · You’re an admin", "19 people · You’re a member". */
export function spaceLine(count: number, role: 'admin' | 'member'): string {
  return `${membersWords(count)} · ${role === 'admin' ? 'You’re an admin' : 'You’re a member'}`;
}

/** Under Delete: what goes, and for how many. */
export function deleteWords(count: number): string {
  return count > 1
    ? `Removes it, and everything in it, for all ${count} people. This can’t be undone.`
    : 'Removes it and everything in it. This can’t be undone.';
}

/** Where a slug leads now: the space it is, or was before a rename. */
export function spaceForSlug<T extends { kind: 'personal' | 'team'; slug: string; oldSlugs?: string[] }>(
  spaces: T[],
  slug: string,
): { space: T; moved: boolean } | null {
  if (slug === PERSONAL_SLUG) {
    const p = spaces.find((s) => s.kind === 'personal');
    return p ? { space: p, moved: false } : null;
  }
  const now = spaces.find((s) => s.kind === 'team' && s.slug === slug);
  if (now) return { space: now, moved: false };
  const before = spaces.find((s) => s.kind === 'team' && s.oldSlugs?.includes(slug));
  return before ? { space: before, moved: true } : null;
}

/** An email change waiting for its code. */
export interface EmailChangeResponse {
  email: string;
}

/** What a confirm dialog asks: its serif question, the words under it and the ink button. */
export interface Ask {
  title: string;
  body: string;
  confirm: string;
}

/** Leave asks once; the last admin is told to make someone else admin first. */
export function leaveAsk(name: string, block: SpaceRules['leaveBlock']): Ask {
  if (block === 'last-admin')
    return {
      title: 'Make someone admin first',
      body: `You’re the only admin of ${name}. Make someone else an admin in Members, then you can leave.`,
      confirm: 'Go to Members',
    };
  if (block === 'last-person')
    return {
      title: `You’re the only one in ${name}`,
      body: `Leaving would leave ${name} empty. Delete it instead, from this page.`,
      confirm: 'OK',
    };
  return {
    title: `Leave ${name}?`,
    body: `You’ll stop seeing its lists, Inbox and people. What you shared stays with the space for everyone else. To come back, someone has to invite you again.`,
    confirm: `Leave ${name}`,
  };
}

export function removeAsk(person: string, name: string): Ask {
  return {
    title: `Remove ${person}?`,
    body: `${person} stops seeing ${name}. Tasks ${person} shared stay here; anything waiting in ${person}’s Inbox from this space goes back to whoever sent it.`,
    confirm: `Remove ${person}`,
  };
}

export function deleteAsk(name: string, count: number): Ask {
  const who = count > 1 ? `for all ${count} people` : 'for good';
  return {
    title: `Delete ${name}?`,
    body: `This removes ${name} and everything in it (every list, task, comment and invite) ${who}. It can’t be undone.`,
    confirm: `Delete ${name}`,
  };
}
