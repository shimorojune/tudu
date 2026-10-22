import { describe, expect, it } from 'vitest';
import {
  allDone,
  doneCount,
  givenName,
  joinedToast,
  peopleHere,
  welcomeBack,
  welcomeTitle,
} from './firstRun';

describe('first run words', () => {
  it('C12-U02 the welcome, the people line, the joined toast and Welcome back', () => {
    expect(welcomeTitle('Rohit Raj')).toBe('Welcome to Tudu, Rohit.');
    expect(welcomeTitle('')).toBe('Welcome to Tudu.');
    expect(welcomeTitle('  ')).toBe('Welcome to Tudu.');
    expect(welcomeTitle('Rohit', 'Northwind')).toBe('Welcome to Northwind, Rohit.');
    expect(welcomeTitle(null, 'Northwind')).toBe('Welcome to Northwind.');

    expect(peopleHere('Meera Nair', 18)).toBe('Meera and 17 others are here.');
    expect(peopleHere('Meera', 2)).toBe('Meera and one other are here.');
    expect(peopleHere('Meera', 1)).toBe('Meera is here.');
    expect(peopleHere(null, 1)).toBe('One other person is here.');
    expect(peopleHere('', 5)).toBe('5 other people are here.');
    expect(peopleHere('Meera', 0)).toBe('It’s just you for now.');

    expect(joinedToast('Northwind', 'Meera', 18)).toBe('You joined Northwind. Meera and 17 others are here.');
    expect(joinedToast('Northwind', 'Meera', 1)).toBe('You joined Northwind. Meera is here.');

    expect(welcomeBack('Rohit Raj')).toBe('Welcome back, Rohit.');
    expect(welcomeBack('')).toBe('Welcome back.');
  });

  it('C12-U02 the first name, the count and all done', () => {
    expect(givenName('  Rohit   Raj ')).toBe('Rohit');
    expect(givenName(undefined)).toBe('');
    const some = { name: true, task: false, theme: true, jira: false };
    expect(doneCount(some)).toBe(2);
    expect(allDone(some)).toBe(false);
    expect(allDone({ name: true, task: true, theme: true, jira: true })).toBe(true);
  });
});
