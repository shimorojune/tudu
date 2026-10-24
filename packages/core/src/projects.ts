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

/** What a screen reader says for each swatch of PROJECT_COLORS, in the same order. */
export const PROJECT_COLOR_NAMES: Record<string, string> = {
  '#3d5a80': 'Navy',
  '#5b7553': 'Moss',
  '#8a5a00': 'Ochre',
  '#7a4e7a': 'Plum',
  '#2f6f6f': 'Teal',
  '#a0522d': 'Rust',
  '#4a6670': 'Slate',
  '#6b5b3e': 'Umber',
};

export const PROJECT_NAME_MAX = 60;

/** A name as compared for "already has": outer spaces gone, inner runs of spaces as one, any case. */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** The project already called `name` (ignoring case and extra spaces), other than `exceptId`; null for none or an empty name. */
export function projectNamed<P extends { id: string; name: string }>(
  projects: readonly P[],
  name: string,
  exceptId?: string | null,
): P | null {
  const key = nameKey(name);
  if (!key) return null;
  return projects.find((p) => p.id !== exceptId && nameKey(p.name) === key) ?? null;
}

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
