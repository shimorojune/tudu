// Copy lint: no em dash anywhere we write, and no Tailwind `rounded-*` classes in UI code (radius comes from the theme).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'playwright-report',
  'test-results',
  'reports',
  'assets',
]);
const TEXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.md', '.json', '.yaml', '.yml', '.html', '.css']);
// The design system's own files are vendored as they are.
const VENDORED = [
  'packages/ui/src/styles/components.css',
  'packages/ui/src/styles/paper-theme.css',
  'packages/ui/tokens.json',
  'pnpm-lock.yaml',
];
const EM_DASH = String.fromCodePoint(0x2014);
const ROUNDED = /\brounded-(?!\[)/;
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.has(extname(name))) check(p);
  }
}

function check(file) {
  const rel = file.slice(ROOT.length);
  if (VENDORED.includes(rel)) return;
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    if (line.includes(EM_DASH)) problems.push(`${rel}:${i + 1}: em dash`);
    if (/\.tsx?$/.test(rel) && ROUNDED.test(line))
      problems.push(`${rel}:${i + 1}: rounded-* class (use the theme's radius)`);
  });
}

walk(ROOT);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('copy lint: ok');
