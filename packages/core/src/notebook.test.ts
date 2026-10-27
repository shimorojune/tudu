import { describe, expect, it } from 'vitest';
import {
  buildTree,
  canDrop,
  canHoldFolder,
  daysLeft,
  firstLine,
  isBlankNote,
  moveTargets,
  nameTaken,
  nameTakenWords,
  notesBelow,
  type NotebookFolder,
  type NoteHeader,
} from './notebook';

const folder = (id: string, parentId: string | null, name: string, position = 1024): NotebookFolder => ({
  id,
  parentId,
  name,
  position,
});
const note = (id: string, folderId: string | null, position = 1024, title = id): NoteHeader => ({
  id,
  folderId,
  title,
  first: '',
  position,
  updatedAt: '2026-10-26T09:00:00.000Z',
  links: 0,
});

// Northwind / Planning / Offsite, Home, and a note in no folder.
const folders = [
  folder('nw', null, 'Northwind', 1024),
  folder('plan', 'nw', 'Planning'),
  folder('off', 'plan', 'Offsite'),
  folder('home', null, 'Home', 2048),
];

describe('C22-U01 the tree', () => {
  it('C22-U01 nests folders and notes by parent and position', () => {
    const tree = buildTree(folders, [
      note('b', 'nw', 2048),
      note('a', 'nw', 1024),
      note('agenda', 'off'),
      note('loose', null),
    ]);
    expect(tree.folders.map((f) => f.name)).toEqual(['Northwind', 'Home']);
    const nw = tree.folders[0]!;
    expect(nw.depth).toBe(0);
    expect(nw.notes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(nw.folders[0]!.name).toBe('Planning');
    expect(nw.folders[0]!.folders[0]!.depth).toBe(2);
    expect(nw.folders[0]!.folders[0]!.notes.map((n) => n.id)).toEqual(['agenda']);
    expect(tree.loose.map((n) => n.id)).toEqual(['loose']);
  });

  it('C22-U01 leaves trashed ones out, and a note whose folder is gone sits at the top of Notebook', () => {
    const tree = buildTree(
      [...folders, { ...folder('old', null, 'Old'), deletedAt: '2026-10-20T00:00:00.000Z' }],
      [
        note('kept', 'home'),
        { ...note('binned', 'home'), deletedAt: '2026-10-25T00:00:00.000Z' },
        note('orphan', 'old'),
        note('lost', 'never-was'),
      ],
    );
    expect(tree.folders.map((f) => f.id)).toEqual(['nw', 'home']);
    expect(tree.folders[1]!.notes.map((n) => n.id)).toEqual(['kept']);
    expect(tree.loose.map((n) => n.id).sort()).toEqual(['lost', 'orphan']);
  });
});

describe('C22-U02 what a drop may do', () => {
  const notes = [note('agenda', 'off'), note('loose', null)];

  it('C22-U02 a folder can’t go into itself or below itself', () => {
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'nw' }, { kind: 'folder', id: 'nw', zone: 'into' }),
    ).toBe(false);
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'nw' }, { kind: 'folder', id: 'off', zone: 'into' }),
    ).toBe(false);
  });

  it('C22-U02 nothing may land deeper than three levels', () => {
    // Planning holds Offsite: two levels, so it can't go under Home's child or into Offsite's level.
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'plan' }, { kind: 'folder', id: 'home', zone: 'into' }),
    ).toBe(true);
    const deeper = [...folders, folder('h2', 'home', 'Kitchen')];
    expect(
      canDrop(deeper, notes, { kind: 'folder', id: 'plan' }, { kind: 'folder', id: 'h2', zone: 'into' }),
    ).toBe(false);
    // Home (one level) under Offsite would be a fourth level.
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'home' }, { kind: 'folder', id: 'off', zone: 'into' }),
    ).toBe(false);
    // Beside Offsite is the third level: fine for Home.
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'home' }, { kind: 'folder', id: 'off', zone: 'before' }),
    ).toBe(true);
    expect(canHoldFolder(folders, 'plan')).toBe(true);
    expect(canHoldFolder(folders, 'off')).toBe(false);
  });

  it('C22-U02 a note can go anywhere, a folder only among folders', () => {
    expect(
      canDrop(folders, notes, { kind: 'note', id: 'loose' }, { kind: 'folder', id: 'off', zone: 'into' }),
    ).toBe(true);
    expect(
      canDrop(folders, notes, { kind: 'note', id: 'agenda' }, { kind: 'root', id: null, zone: 'root' }),
    ).toBe(true);
    expect(
      canDrop(folders, notes, { kind: 'note', id: 'agenda' }, { kind: 'note', id: 'loose', zone: 'after' }),
    ).toBe(true);
    expect(
      canDrop(folders, notes, { kind: 'folder', id: 'home' }, { kind: 'note', id: 'loose', zone: 'after' }),
    ).toBe(false);
  });
});

describe('C22-U03 the Move list', () => {
  it('C22-U03 lists every folder with its path, Notebook first, and marks the current one Here', () => {
    const list = moveTargets(folders, 'plan');
    expect(list.map((t) => [t.title, t.sub, t.here])).toEqual([
      ['Notebook', null, false],
      ['Northwind', null, false],
      ['Planning', 'Northwind', true],
      ['Offsite', 'Northwind / Planning', false],
      ['Home', null, false],
    ]);
    expect(moveTargets(folders, null)[0]!.here).toBe(true);
  });
});

describe('C22-U04 an untitled note', () => {
  it('C22-U04 shows its first line, tags stripped, cut at 80 characters', () => {
    expect(firstLine('<h2>Sunday <b>scribbles</b></h2><p>Call the bank</p>')).toBe('Sunday scribbles');
    expect(firstLine('<p></p><p>  </p><ul><li>Second line first</li></ul>')).toBe('Second line first');
    const long = firstLine(`<p>${'word '.repeat(40)}</p>`);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
  });

  it('C22-U04 a note with neither title nor words is empty and isn’t kept', () => {
    expect(isBlankNote('', '')).toBe(true);
    expect(isBlankNote('  ', '<p></p><p><br></p>')).toBe(true);
    expect(isBlankNote('Only a title', '')).toBe(false);
    expect(isBlankNote('', '<p>a word</p>')).toBe(false);
  });
});

describe('C22-U05 Trash', () => {
  it('C22-U05 days left: 30 on the day, 1 on the last day, never below 1', () => {
    const at = '2026-10-01T10:00:00.000Z';
    expect(daysLeft(at, new Date('2026-10-01T10:00:01.000Z'))).toBe(30);
    expect(daysLeft(at, new Date('2026-10-30T12:00:00.000Z'))).toBe(1);
    expect(daysLeft(at, new Date('2026-11-04T00:00:00.000Z'))).toBe(1);
  });

  it('C22-U05 a folder delete counts every note below it', () => {
    const notes = [note('a', 'nw'), note('b', 'plan'), note('c', 'off'), note('d', 'home'), note('e', null)];
    expect(notesBelow(folders, notes, 'nw')).toBe(3);
    expect(notesBelow(folders, notes, 'off')).toBe(1);
  });

  it('C22-U05 folder names in one place are unique, any case', () => {
    expect(nameTaken(folders, 'plan', 'offsite')).toBe(true);
    expect(nameTaken(folders, 'plan', 'Offsite', 'off')).toBe(false);
    expect(nameTaken(folders, 'home', 'Offsite')).toBe(false);
    expect(nameTakenWords(folders, 'plan', 'Offsite')).toBe('Planning already has a folder called Offsite.');
  });
});
