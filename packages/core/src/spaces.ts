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
}

/** One member of a space. */
export interface Member {
  id: string;
  name: string;
  email: string;
  color: string | null;
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
