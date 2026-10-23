import { z } from 'zod';

/** The muted swatches a project can take, in the order new projects get them. */
export const PROJECT_COLORS = [
  '#3d5a80',
  '#5b7553',
  '#8a5a00',
  '#7a4e7a',
  '#2f6f6f',
  '#a0522d',
  '#4a6670',
  '#6b5b3e',
] as const;

export const PROJECT_NAME_MAX = 60;

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'A project needs a name.')
  .max(PROJECT_NAME_MAX, 'That name is too long.');
export const projectColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, 'Not a colour.');

/** The next colour for a new project: the first of the palette not yet taken, then round again. */
export function nextProjectColor(taken: string[]): string {
  const used = new Set(taken.map((c) => c.toLowerCase()));
  const free = PROJECT_COLORS.find((c) => !used.has(c));
  if (free) return free;
  return PROJECT_COLORS[taken.length % PROJECT_COLORS.length]!;
}

/** The toast after a project is deleted: "Platform deleted. Its 3 tasks keep no project." */
export function projectDeletedWords(name: string, open: number): string {
  if (open === 0) return `${name} deleted.`;
  return `${name} deleted. Its ${open === 1 ? 'task keeps' : `${open} tasks keep`} no project.`;
}
