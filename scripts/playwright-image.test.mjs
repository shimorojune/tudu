import { describe, expect, it } from 'vitest';
import { checkImages, checkRepo, lockedVersion } from './playwright-image.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const job = (tag) =>
  `jobs:\n  e2e:\n    container:\n      image: mcr.microsoft.com/playwright:v${tag}-noble\n`;

describe('scripts/playwright-image', () => {
  it('C01-U16 the repo as it is: every Playwright image matches the lockfile', () => {
    expect(checkRepo(ROOT)).toEqual([]);
  });

  it('C01-U17 a stale tag names the file and both versions', () => {
    expect(checkImages('1.64.1', { 'ci.yml': job('1.64.1'), 'flake-check.yml': job('1.63.0') })).toEqual([
      'flake-check.yml: image playwright:v1.63.0 but @playwright/test is 1.64.1; set the tag to v1.64.1',
    ]);
  });

  it('C01-U18 no workflow using the image at all is a failure', () => {
    expect(checkImages('1.64.1', { 'ci.yml': 'jobs: {}\n' })).toEqual([
      'no workflow runs in the mcr.microsoft.com/playwright image',
    ]);
  });

  it('C01-U19 reads the resolved version from the lockfile, not the range', () => {
    expect(lockedVersion("packages:\n\n  '@playwright/test@1.64.1':\n    resolution: {}\n")).toBe('1.64.1');
    expect(() => lockedVersion('packages: {}\n')).toThrow(/no @playwright\/test/);
  });
});
