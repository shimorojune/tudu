import { describe, expect, it } from 'vitest';
import { dropHash, exactProject, hashAt, hashMark, hashMatches, hashProjectName } from './projectHash';

const P = [
  { name: 'Northwind' },
  { name: 'Platform' },
  { name: 'Home' },
  { name: 'Offsite 2027' },
  { name: 'Plants' },
];

describe('PH-U01 hashAt finds the #word the caret is in', () => {
  it('PH-U01 at the start, after a space, and with letters after the #', () => {
    expect(hashAt('#', 1)).toEqual({ start: 0, end: 1, query: '' });
    expect(hashAt('Call the venue #', 16)).toEqual({ start: 15, end: 16, query: '' });
    expect(hashAt('Review notes #pla', 17)).toEqual({ start: 13, end: 17, query: 'pla' });
  });
  it('PH-U01 a # before a digit, inside a word, or with the caret elsewhere is just text', () => {
    expect(hashAt('Fix #92', 7)).toBeNull();
    expect(hashAt('Learn C#', 8)).toBeNull();
    expect(hashAt('a#b', 3)).toBeNull();
    expect(hashAt('Review #pla notes', 17)).toBeNull();
    expect(hashAt('No hash here', 12)).toBeNull();
  });
  it('PH-U01 only the last #word before the caret counts', () => {
    expect(hashAt('#home and #pla', 14)).toEqual({ start: 10, end: 14, query: 'pla' });
    expect(hashAt('#home and #pla', 5)).toEqual({ start: 0, end: 5, query: 'home' });
  });
});

describe('PH-U02 hashMatches orders matches', () => {
  it('PH-U02 names that start with the letters come before words inside names, any case', () => {
    expect(hashMatches(P, 'pla').map((p) => p.name)).toEqual(['Platform', 'Plants']);
    expect(hashMatches(P, 'OFF').map((p) => p.name)).toEqual(['Offsite 2027']);
    expect(hashMatches(P, '2027').map((p) => p.name)).toEqual(['Offsite 2027']);
    expect(hashMatches(P, 'zzz')).toEqual([]);
  });
  it('PH-U02 no letters keeps every project in its order', () => {
    expect(hashMatches(P, '')).toEqual(P);
  });
  it('PH-U02 the bold part sits on the matched letters', () => {
    expect(hashMark('Platform', 'pla')).toEqual([0, 3]);
    expect(hashMark('Offsite 2027', '20')).toEqual([8, 10]);
    expect(hashMark('Platform', '')).toBeNull();
  });
  it('PH-U02 an exact name, any case, is found; a part is not', () => {
    expect(exactProject(P, 'home')?.name).toBe('Home');
    expect(exactProject(P, 'hom')).toBeNull();
  });
});

describe('PH-U03 dropHash takes the #word out', () => {
  it('PH-U03 at the end, the start and the middle, closing up spaces', () => {
    expect(dropHash('Review the notes #pla', { start: 17, end: 21 })).toEqual({
      text: 'Review the notes',
      caret: 16,
    });
    expect(dropHash('#pla Review', { start: 0, end: 4 })).toEqual({ text: 'Review', caret: 0 });
    expect(dropHash('Book #nor the room', { start: 5, end: 9 })).toEqual({ text: 'Book the room', caret: 5 });
  });
  it('PH-U03 a new project from #garden gets a capital first letter; one typed with capitals stays', () => {
    expect(hashProjectName('garden')).toBe('Garden');
    expect(hashProjectName('iOS')).toBe('iOS');
    expect(hashProjectName('')).toBe('');
  });
});
