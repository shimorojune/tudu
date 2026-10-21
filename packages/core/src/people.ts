import { addDays, compareIso, formatDay, relativeDayLabel, weekdayName, type IsoDate } from './dates';
import type { Task } from './tasks';

/** Someone in a space, as People shows them. */
export interface Person {
  id: string;
  name: string;
  email: string;
  color: string | null;
  /** Their photo's address, or null for initials. */
  image?: string | null;
  initials: string;
  you?: boolean;
}

/** Someone's shared tasks for a range, with how many they share this week. */
export interface PersonTasks extends Person {
  /** No longer in the space; what they shared stays. */
  left?: boolean;
  count: number;
  tasks: Task[];
}

/** People: everyone in the space with their shared tasks for the range asked. */
export interface PeopleResponse {
  from: IsoDate;
  to: IsoDate;
  members: PersonTasks[];
}

/** One person, their shared tasks for the range. */
export interface PersonResponse {
  from: IsoDate;
  to: IsoDate;
  person: PersonTasks;
}

/** Initials for a mark: "Meera Nair" gives MN, "meera@x.y" gives M. */
export function initialsOf(name: string, email = ''): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  if (words.length === 1 && words[0]!.length) return words[0]!.slice(0, 2).toUpperCase();
  return email.slice(0, 1).toUpperCase();
}

/** Someone's first name, "Meera" from "Meera Nair"; the email's first part when there is no name. */
export function firstName(name: string, email = ''): string {
  const w = name.trim().split(/\s+/)[0];
  return w || email.split('@')[0] || 'Someone';
}

/** "People · 19 in Northwind" reads as "19 in Northwind" beside the title. */
export function peopleCount(n: number, spaceName: string): string {
  return `${n} in ${spaceName}`;
}

/** "23 shared this week", "Nothing shared this week". */
export function sharedWords(n: number): string {
  return n ? `${n} shared this week` : 'Nothing shared this week';
}

/** "No one called “Mee” in Northwind." */
export function nobodyWords(q: string, spaceName: string): string {
  return `No one called “${q.trim()}” in ${spaceName}.`;
}

/** Find someone: the people whose name or email holds the words. */
export function findPeople<T extends { name: string; email: string }>(people: T[], q: string): T[] {
  const t = q.trim().toLowerCase();
  if (!t) return people;
  return people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(t));
}

export type PeopleRange = 'today' | 'week';
export type PeopleGroup = 'day' | 'person';

export interface SharedGroup<T> {
  key: string;
  title: string;
  items: Array<{ task: T; who: Person }>;
}

/** The heading of a day's group: "Today · Sun 18 Oct", "Mon 19 Oct". */
export function dayGroupTitle(day: IsoDate, today: IsoDate): string {
  const rel = relativeDayLabel(day, today);
  return rel === 'Today' || rel === 'Tomorrow' || rel === 'Yesterday'
    ? `${rel} · ${formatDay(day)}`
    : formatDay(day);
}

/**
 * Everyone's shared tasks, grouped by day (in day order, people in list order within a day) or by person (in list
 * order, their tasks by day). Today keeps only today's tasks; the week keeps every day of the range.
 */
export function groupShared<T extends Task>(
  members: Array<Person & { tasks: T[] }>,
  by: PeopleGroup,
  range: PeopleRange,
  today: IsoDate,
): Array<SharedGroup<T>> {
  const keep = (t: T) => t.day !== null && (range === 'week' || t.day === today);
  if (by === 'person') {
    return members
      .map((m) => ({
        key: m.id,
        title: m.you ? `${m.name} (you)` : m.name,
        items: m.tasks
          .filter(keep)
          .sort((a, b) => compareIso(a.day!, b.day!) || a.position - b.position)
          .map((task) => ({ task, who: m })),
      }))
      .filter((g) => g.items.length);
  }
  const days = new Map<IsoDate, Array<{ task: T; who: Person }>>();
  for (const m of members)
    for (const t of m.tasks) {
      if (!keep(t)) continue;
      const list = days.get(t.day!) ?? [];
      list.push({ task: t, who: m });
      days.set(t.day!, list);
    }
  return [...days.keys()]
    .sort(compareIso)
    .map((day) => ({ key: day, title: dayGroupTitle(day, today), items: days.get(day)! }));
}

/** How many tasks a list of groups holds. */
export function sharedTotal<T>(groups: Array<SharedGroup<T>>): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

/** One person's week, day by day: every day of the range, with their tasks on it (an empty day stays). */
export function personDays<T extends Task>(
  tasks: T[],
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): Array<{ day: IsoDate; title: string; tasks: T[] }> {
  const out: Array<{ day: IsoDate; title: string; tasks: T[] }> = [];
  for (let d = from; compareIso(d, to) <= 0; d = addDays(d, 1)) {
    out.push({
      day: d,
      title: d === today ? `Today · ${weekdayName(d)}` : dayGroupTitle(d, today),
      tasks: tasks.filter((t) => t.day === d).sort((a, b) => a.position - b.position),
    });
  }
  return out;
}

/** "Mon 19 Oct · Meera’s": where someone else's task sits, at the top of its panel. */
export function ownerWords(day: IsoDate | null, owner: string, today: IsoDate): string {
  const where = day === null ? 'Backlog' : day === today ? `Today · ${formatDay(day)}` : formatDay(day);
  return `${where} · ${firstName(owner)}’s`;
}
