import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localModelDir } from './modelDir';

const temp = () => mkdtempSync(join(tmpdir(), 'tudu-modeldir-'));

describe('localModelDir', () => {
  it('C13-U10 a plain checkout keeps the model in its own .local/models', () => {
    const repo = temp();
    mkdirSync(join(repo, '.git'));
    expect(localModelDir(repo)).toBe(join(repo, '.local/models'));
  });

  it('C13-U11 a git worktree uses the main checkout’s folder', () => {
    const main = temp();
    const wtGit = join(main, '.git/worktrees/feature');
    mkdirSync(wtGit, { recursive: true });
    writeFileSync(join(wtGit, 'commondir'), '../..\n');
    const wt = temp();
    writeFileSync(join(wt, '.git'), `gitdir: ${wtGit}\n`);
    expect(localModelDir(wt)).toBe(join(main, '.local/models'));
  });

  it('C13-U12 a worktree whose gitdir has no commondir file still finds the main checkout', () => {
    const main = temp();
    const wtGit = join(main, '.git/worktrees/other');
    mkdirSync(wtGit, { recursive: true });
    const wt = temp();
    writeFileSync(join(wt, '.git'), `gitdir: ${wtGit}\n`);
    expect(localModelDir(wt)).toBe(join(main, '.local/models'));
  });

  it('C13-U13 no .git at all (an unpacked tree) falls back to the folder itself', () => {
    const repo = temp();
    expect(localModelDir(repo)).toBe(join(repo, '.local/models'));
  });

  it('C13-U14 a .git file without a gitdir line falls back to the folder itself', () => {
    const repo = temp();
    writeFileSync(join(repo, '.git'), 'nonsense\n');
    expect(localModelDir(repo)).toBe(join(repo, '.local/models'));
  });
});
