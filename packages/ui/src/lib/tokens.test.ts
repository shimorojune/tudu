/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readStylesheet } from '../test-utils/stylesheet';

/**
 * C00-U01: tokens.json and the theme agree. Every colour token is a variable with its light value in `:root` and
 * its dark value in `.dark`; the radius, duration, easing, shadow, size and opacity tokens have a variable too.
 *
 * Not checked: `spacing` (the 4px grid is Tailwind's own `--spacing` scale; there is no `--space-N` variable) and
 * `type` (fonts and the type scale are the `--font-*` and `--text-*` variables in `@theme`, named by role).
 */

interface Token {
  name: string;
  value: string | { light: string; dark: string };
  usage?: string;
}
type Group = 'color' | 'radius' | 'shadow' | 'easing' | 'duration' | 'size' | 'opacity';
type Tokens = Record<Group, { tokens: Token[] }>;

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(resolve(here, '../../tokens.json'), 'utf8')) as Tokens;
const theme = readStylesheet('paper-theme.css');
const extra = readStylesheet('tokens-extra.css');

/** The bodies of every top-level block headed exactly `header` (`:root`, `.dark`, `@theme`), joined. */
function blockOf(css: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = '';
  for (const m of css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{`, 'g'))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let j = start;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    out += `${css.slice(start, j - 1)}\n`;
  }
  return out;
}

/** `--name: value;` declarations anywhere in `css`, by name. */
function declared(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/(?:^|[\s;{])--([\w-]+)\s*:\s*([^;}]+)/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** A radius expression in px, given `--radius`. */
function px(expr: string, radius: number): number {
  if (/^\d+px$/.test(expr)) return Number.parseInt(expr, 10);
  if (expr === 'var(--radius)') return radius;
  const m = /^calc\(var\(--radius\) ([+-]) (\d+)px\)$/.exec(expr);
  if (!m) throw new Error(`cannot evaluate ${expr}`);
  return m[1] === '+' ? radius + Number(m[2]) : radius - Number(m[2]);
}

// The five colour ramps (paper, ember, jira, moss, amber) are the one exception to "light and dark": each step is a
// single value, the same in both themes, declared once as `--color-<name>` in `@theme` for Tailwind. The semantic
// tokens pick different steps per theme, and those are the ones that must be in both blocks.
const RAMP = /^(paper|ember|jira|moss|amber)-\d+$/;

describe('tokens.json and paper-theme.css', () => {
  const light = declared(blockOf(theme, ':root'));
  const dark = declared(blockOf(theme, '.dark'));
  const semantic = tokens.color.tokens.filter((t) => !RAMP.test(t.name));
  const ramps = tokens.color.tokens.filter((t) => RAMP.test(t.name));

  it('C00-U01 every semantic colour token has its light value in :root and its dark value in .dark', () => {
    expect(semantic.length).toBeGreaterThan(50);
    const missing = semantic.filter((t) => !(t.name in light) || !(t.name in dark)).map((t) => t.name);
    expect(missing).toEqual([]);
    for (const t of semantic) {
      expect(typeof t.value, `${t.name} has a light and a dark value`).toBe('object');
      const v = t.value as { light: string; dark: string };
      expect(light[t.name], `--${t.name} in :root`).toBe(v.light);
      expect(dark[t.name], `--${t.name} in .dark`).toBe(v.dark);
    }
  });

  it('C00-U01 the colour ramps are single-valued and declared once as --color-<name> in @theme', () => {
    expect(ramps).toHaveLength(55);
    const palette = declared(blockOf(theme, '@theme'));
    for (const t of ramps) {
      expect(typeof t.value, `${t.name} has one value`).toBe('string');
      expect(`color-${t.name}` in palette, `--color-${t.name} in @theme`).toBe(true);
      expect(t.name in light, `--${t.name} is not a theme variable`).toBe(false);
      expect(t.name in dark, `--${t.name} is not a theme variable`).toBe(false);
    }
  });

  it('C00-U01 radius, duration, easing, shadow, size and opacity tokens each have a variable', () => {
    const all = declared(`${theme}\n${extra}`);
    for (const g of ['radius', 'duration', 'easing', 'shadow', 'size', 'opacity'] as const) {
      expect(tokens[g].tokens.length).toBeGreaterThan(0);
      const missing = tokens[g].tokens.filter((t) => !(t.name in all)).map((t) => `${g}: ${t.name}`);
      expect(missing).toEqual([]);
    }
    // Where the variable holds a literal, it is the token's value.
    for (const g of ['duration', 'easing', 'size', 'opacity'] as const) {
      for (const t of tokens[g].tokens) expect(all[t.name], `--${t.name}`).toBe(t.value);
    }
    // Radii derive from --radius (0.75rem is 12px): calc(var(--radius) +/- Npx) must come to the token's pixels.
    expect(all.radius).toBe('0.75rem');
    for (const t of tokens.radius.tokens) expect(`${px(all[t.name]!, 12)}px`, `--${t.name}`).toBe(t.value);
    // Shadows are composed from --hair and --shadow-color, which carry the light and dark values, so the name is the check.
    for (const t of tokens.shadow.tokens)
      expect(all[t.name], `--${t.name}`).toMatch(/var\(--shadow-color\)|var\(--hair\)/);
  });

  it('C00-U01 the .light desk in tokens-extra.css mirrors :root', () => {
    const desk = declared(blockOf(extra, '.light'));
    for (const t of semantic) expect(desk[t.name], `--${t.name} in .light`).toBe(light[t.name]);
    for (const [name, value] of Object.entries(desk)) expect(light[name], `--${name} in :root`).toBe(value);
  });
});
