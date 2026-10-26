import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Where local work and tests keep the close-matches model: `.local/models` in the main checkout, so every git
 * worktree of it shares one download. In a worktree `.git` is a file pointing at `<main>/.git/worktrees/<name>`.
 */
export function localModelDir(repoRoot: string): string {
  return join(mainCheckout(repoRoot), '.local/models');
}

function mainCheckout(repoRoot: string): string {
  const dotGit = join(repoRoot, '.git');
  try {
    if (!statSync(dotGit).isFile()) return repoRoot;
    const gitdir = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
    if (!gitdir) return repoRoot;
    const worktreeGit = resolve(repoRoot, gitdir);
    let common: string;
    try {
      common = resolve(worktreeGit, readFileSync(join(worktreeGit, 'commondir'), 'utf8').trim());
    } catch {
      common = resolve(worktreeGit, '../..');
    }
    return basename(common) === '.git' ? dirname(common) : repoRoot;
  } catch {
    return repoRoot;
  }
}
