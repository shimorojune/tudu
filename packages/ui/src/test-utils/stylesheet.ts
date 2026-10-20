import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Helpers for tests about what the stylesheet does. jsdom has no layout and the Vitest config turns CSS off, so a
 * test about a size, a press state or an ellipsis reads the rule from the stylesheet itself.
 */

export interface CssRule {
  /** The selector list as written. */
  selector: string;
  /** Enclosing at-rules, outermost first, e.g. `@media (prefers-reduced-motion: reduce)`. */
  context: string[];
  /** Declarations in source order; the last one for a property wins. */
  declarations: Record<string, string>;
}

export type StylesheetName = 'components.css' | 'paper-theme.css' | 'tokens-extra.css';

/** One of the package's stylesheets, as text. */
export function readStylesheet(name: StylesheetName): string {
  return readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), 'utf8');
}

/** Split `text` on `sep` outside quotes and parentheses. */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let buf = '';
  for (const ch of text) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `a: b; c: d` as an object. */
export function parseDeclarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of splitTop(body, ';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** A small, forgiving parser: every rule with its selector, declarations and enclosing at-rules. Comments are dropped. */
export function parseRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ''), [], rules);
  return rules;
}

function walk(src: string, context: string[], out: CssRule[]): void {
  let i = 0;
  for (;;) {
    const open = src.indexOf('{', i);
    if (open < 0) return;
    // Statements such as `@import x;` before the block are not rules.
    const head = src.slice(i, open).split(';').pop()!.trim();
    let depth = 1;
    let j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (body.includes('{')) walk(body, [...context, head], out);
    else out.push({ selector: head, context, declarations: parseDeclarations(body) });
    i = j;
  }
}

/** The items of a rule's selector list: `.a:hover, .b` gives `['.a:hover', '.b']`. */
export function selectors(rule: CssRule): string[] {
  return splitTop(rule.selector, ',');
}

/** Rules (outside at-rules) with at least one selector satisfying `pred`. */
export function rulesWhere(rules: CssRule[], pred: (selector: string) => boolean): CssRule[] {
  return rules.filter((r) => r.context.length === 0 && selectors(r).some(pred));
}

/**
 * The rules (outside at-rules) whose selector matches `el`, in source order, the cascade ignored. Selectors jsdom
 * cannot evaluate, pseudo-elements among them, are skipped.
 */
export function rulesFor(rules: CssRule[], el: Element): CssRule[] {
  return rulesWhere(rules, (s) => {
    try {
      return el.matches(s);
    } catch {
      return false;
    }
  });
}

/** The declarations that apply to `el`, later rules winning. */
export function declarationsFor(rules: CssRule[], el: Element): Record<string, string> {
  return Object.assign({}, ...rulesFor(rules, el).map((r) => r.declarations));
}

/** The custom properties declared directly in the rules whose selector is exactly `selector`, merged. */
export function variablesOf(rules: CssRule[], selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) {
    if (r.selector !== selector) continue;
    for (const [k, v] of Object.entries(r.declarations)) if (k.startsWith('--')) out[k.slice(2)] = v;
  }
  return out;
}
