import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * C00-U04: the copy lint. The rules live in scripts/lint-copy.mjs (EM_DASH, ROUNDED and the `.ts`/`.tsx` guard on
 * the second); they are copied here because importing the script would walk the repo and exit. The last test reads
 * the script and checks the copy is still the same rule.
 *
 * The em dash and the Tailwind radius prefix are built from pieces, so that this file passes the lint it documents.
 */
const EM_DASH = String.fromCodePoint(0x2014);
const ROUNDED_SOURCE = ['\\b', 'rounded', '-(?!\\[)'].join('');
const ROUNDED = new RegExp(ROUNDED_SOURCE);
const RADIUS_CLASS = (suffix: string) => ['rounded', suffix].join('-');

/** scripts/lint-copy.mjs `check()`, for one file: the problems it would report. */
function lint(rel: string, text: string): string[] {
  const problems: string[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${rel}:${i + 1}: em dash`);
    if (/\.tsx?$/.test(rel) && ROUNDED.test(line)) problems.push(`${rel}:${i + 1}: radius class`);
  });
  return problems;
}

describe('copy lint', () => {
  it('C00-U04 a line with an em dash fails, in any text file', () => {
    expect(lint('docs/plan.md', `Today ${EM_DASH} and tomorrow`)).toEqual(['docs/plan.md:1: em dash']);
    expect(lint('packages/ui/src/x.ts', `const a = 1;\nconst b = 'a ${EM_DASH} b';`)).toEqual(['packages/ui/src/x.ts:2: em dash']);
    // hyphens, en dashes and minus signs are fine
    expect(lint('docs/plan.md', 'Day-to-day, 10–12 October, 3 − 1')).toEqual([]);
  });

  it('C00-U04 a Tailwind radius class in a component fails', () => {
    const line = `<div className="${RADIUS_CLASS('lg')} p-2" />`;
    expect(lint('packages/ui/src/components/X.tsx', line)).toEqual(['packages/ui/src/components/X.tsx:1: radius class']);
    expect(lint('apps/web/src/page.ts', `const c = '${RADIUS_CLASS('full')}';`)).toHaveLength(1);
    // the rule is for UI code only: the same text in a markdown file or a stylesheet passes
    expect(lint('docs/notes.md', line)).toEqual([]);
    expect(lint('packages/ui/src/styles/x.css', `.${RADIUS_CLASS('lg')} { border-radius: 12px; }`)).toEqual([]);
    // an arbitrary value is the theme's radius spelled out, and `rounded` on its own is not a class prefix
    expect(lint('packages/ui/src/components/X.tsx', `className="${RADIUS_CLASS('[var(--radius-lg)]')}"`)).toEqual([]);
    expect(lint('packages/ui/src/components/X.tsx', 'const rounded = Math.round(x);')).toEqual([]);
  });

  it('C00-U04 clean source passes', () => {
    expect(lint('packages/ui/src/components/Button.tsx', readFileSync(fileURLToPath(new URL('../components/Button.tsx', import.meta.url)), 'utf8'))).toEqual([]);
  });

  it('C00-U04 the rules above are the ones in scripts/lint-copy.mjs', () => {
    const script = readFileSync(fileURLToPath(new URL('../../../../scripts/lint-copy.mjs', import.meta.url)), 'utf8');
    expect(script).toContain('String.fromCodePoint(0x2014)');
    expect(script).toContain(`/${ROUNDED_SOURCE}/`);
    expect(script).toContain('/\\.tsx?$/.test(rel) && ROUNDED.test(line)');
    expect(script).toContain('line.includes(EM_DASH)');
  });
});
