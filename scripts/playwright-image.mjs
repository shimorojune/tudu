#!/usr/bin/env node
// The web end-to-end jobs run in Playwright's own image, whose browsers only fit the same @playwright/test version.
// `node scripts/playwright-image.mjs` fails when a workflow's image tag and the lockfile disagree.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IMAGE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-\w+/g;

/** The resolved @playwright/test version in pnpm-lock.yaml. */
export function lockedVersion(lockfile) {
  const m = /^ {2}'?@playwright\/test@(\d+\.\d+\.\d+)'?:/m.exec(lockfile);
  if (!m) throw new Error('pnpm-lock.yaml has no @playwright/test');
  return m[1];
}

/** Every problem, as a line; empty when each image tag matches `version` and at least one workflow uses it. */
export function checkImages(version, workflows) {
  const problems = [];
  let used = 0;
  for (const [file, text] of Object.entries(workflows))
    for (const [, tag] of text.matchAll(IMAGE)) {
      used++;
      if (tag !== version)
        problems.push(
          `${file}: image playwright:v${tag} but @playwright/test is ${version}; set the tag to v${version}`,
        );
    }
  if (used === 0) problems.push('no workflow runs in the mcr.microsoft.com/playwright image');
  return problems;
}

export function checkRepo(root) {
  const dir = join(root, '.github/workflows');
  const workflows = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => [`.github/workflows/${f}`, readFileSync(join(dir, f), 'utf8')]),
  );
  return checkImages(lockedVersion(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')), workflows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkRepo(new URL('..', import.meta.url).pathname);
  for (const p of problems) console.error(p);
  process.exit(problems.length ? 1 : 0);
}
