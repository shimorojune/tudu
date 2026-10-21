import { formatDay, type IsoDate } from './dates';
import { dayWord } from './carried';

/** Someone on an Inbox item: the sender, the receiver, a comment's author. */
export interface InboxPerson {
  id: string;
  name: string;
  email: string;
  color: string | null;
  initials: string;
}

export type RequestState = 'waiting' | 'accepted' | 'declined' | 'withdrawn';

/** A task someone sent: its own row until it is accepted. */
export interface TaskRequest {
  id: string;
  spaceId: string;
  from: InboxPerson;
  to: InboxPerson;
  title: string;
  /** The sender's note, plain words. */
  note: string;
  /** The day the sender asked for; null for no day. */
  askedDay: IsoDate | null;
  due: IsoDate | null;
  projectId: string | null;
  attachments: string[];
  state: RequestState;
  /** Why it was declined. */
  reason: string | null;
  /** When the receiver first opened it. */
  seenAt: string | null;
  /** The task it became (accepted), or the one Take it back made. */
  taskId: string | null;
  /** The day that task is on, when there is one. */
  taskDay: IsoDate | null;
  createdAt: string;
  answeredAt: string | null;
}

export type InboxKind = 'request' | 'comment' | 'answer';

/** A comment on one of your tasks, as the Inbox shows it. */
export interface InboxComment {
  id: string;
  html: string;
  author: InboxPerson;
  task: { id: string; ref: string | null; title: string; day: IsoDate | null; done: boolean };
}

/** One thing in the Inbox: a request to answer, a comment on your task, or an answer to a request you sent. */
export interface InboxItem {
  id: string;
  kind: InboxKind;
  spaceId: string;
  createdAt: string;
  readAt: string | null;
  request?: TaskRequest;
  comment?: InboxComment;
}

export type InboxView = 'inbox' | 'answered' | 'sent';

export interface InboxResponse {
  view: InboxView;
  /** Requests to you still waiting, newest first. */
  toAnswer: InboxItem[];
  /** Comments and answers, newest first. */
  updates: InboxItem[];
  /** Requests you accepted or declined, newest first. */
  answered: InboxItem[];
  /** Requests you sent, newest first (taken-back ones left out). */
  sent: TaskRequest[];
  counts: InboxCounts;
}

export interface InboxCounts {
  /** Requests waiting for your answer. */
  toAnswer: number;
  /** Updates not read yet. */
  unread: number;
}

/** Something landed in or left this person's Inbox in a space: read it again. */
export interface InboxChangedEvent {
  spaceId: string;
}
export const INBOX_CHANGED = 'inbox.changed';

export const REQUEST_NOTE_MAX = 2000;
export const DECLINE_REASON_MAX = 500;

/** The header's count: "2 to answer · 3 new", "All caught up". */
export function inboxCountWords(c: InboxCounts): string {
  const parts: string[] = [];
  if (c.toAnswer) parts.push(`${c.toAnswer} to answer`);
  if (c.unread) parts.push(`${c.unread} new`);
  return parts.length ? parts.join(' · ') : 'All caught up';
}

/** "4 answered", "Nothing answered yet". */
export function answeredWords(n: number): string {
  return n ? `${n} answered` : 'Nothing answered yet';
}

/** "3 sent · 1 waiting", "Nothing sent". */
export function sentWords(sent: Array<{ state: RequestState }>): string {
  if (!sent.length) return 'Nothing sent';
  const waiting = sent.filter((s) => s.state === 'waiting').length;
  return waiting ? `${sent.length} sent · ${waiting} waiting` : `${sent.length} sent`;
}

/** The sidebar's Inbox count: to answer plus new. */
export function inboxBadge(c: InboxCounts | undefined): number {
  return c ? c.toAnswer + c.unread : 0;
}

/** "Accepted onto Fri 16 Oct. It's in Answered." */
export function acceptedWords(day: IsoDate | null, today: IsoDate): string {
  return `Accepted onto ${dayWord(day, today)}. It’s in Answered.`;
}

/** "Sent to Meera. It's in Sent until Meera answers.", with the space when it is another one. */
export function sentToWords(first: string, spaceName?: string): string {
  return spaceName
    ? `Sent to ${first} in ${spaceName}. It’s in Sent until ${first} answers.`
    : `Sent to ${first}. It’s in Sent until ${first} answers.`;
}

/** "Asks for Tue", "No day asked": the planned chip's words while sending. */
export function asksForWords(day: IsoDate | null, today: IsoDate): string {
  return day ? `Asks for ${dayWord(day, today)}` : 'No day asked';
}

/** "For Tue 20 Oct" on a request's byline. */
export function forWords(day: IsoDate | null): string | null {
  return day ? `For ${formatDay(day)}` : null;
}

/** The words that narrow the Inbox: names, titles, notes, comments and reasons. */
export function inboxText(item: InboxItem): string {
  const r = item.request;
  const c = item.comment;
  return [
    r?.from.name,
    r?.from.email,
    r?.to.name,
    r?.to.email,
    r?.title,
    r?.note,
    r?.reason,
    c?.author.name,
    c?.author.email,
    c?.task.title,
    c ? c.html.replace(/<[^>]+>/g, ' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** The items whose words hold `q`. */
export function filterInbox<T extends InboxItem>(items: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((i) => inboxText(i).includes(t));
}

/** The requests (Sent) whose words hold `q`. */
export function filterSent<T extends TaskRequest>(items: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((r) =>
    [r.to.name, r.to.email, r.title, r.note, r.reason ?? ''].join(' ').toLowerCase().includes(t),
  );
}

/** "Nothing in the Inbox matches “invoice”. Try a name or a task title." */
export function noMatchWords(q: string): string {
  return `Nothing in the Inbox matches “${q.trim()}”. Try a name or a task title.`;
}
