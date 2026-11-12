import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { scrambleText } from '@tudu/core';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '../components/AccountMenu';
import { FeedbackDialog } from '../components/FeedbackDialog';
import { FeedbackReports } from '../components/FeedbackReports';
import { JiraPreview } from '../components/JiraPanel';
import { MenuBarRow } from '../components/MenuBarSheet';
import { NoteRow } from '../components/NoteParts';
import { PersonDot } from '../components/PersonDot';
import { RichTextContent, RichTextEditor } from '../components/RichTextEditor';
import { SimilarReports } from '../components/SimilarReports';
import { SpaceSwitch } from '../components/SpaceSwitch';
import { TaskLine } from '../components/TaskLine';
import { TopBar } from '../components/TopBar';
import {
  SCRAMBLE_STORAGE_KEY,
  readScramble,
  resetScrambleForTests,
  scrambleHtml,
  setScramble,
  useMine,
  useMineField,
  useScramble,
} from './scramble';

/** The sentinel: a word no screen of Tudu says by itself. */
const Z = 'Zorbleck';

beforeEach(() => {
  localStorage.clear();
  resetScrambleForTests();
});
afterEach(() => {
  act(() => setScramble(false));
  localStorage.clear();
  resetScrambleForTests();
});

const on = () => act(() => setScramble(true));
const key = () => readScramble().key;

describe('Scramble my text (chunk 23)', () => {
  it('C23-U04 scrambleHtml: words jumble; tags, marks, links, lists, checkboxes and their attrs keep their shape; file names too', () => {
    const k = '00112233445566778899aabbccddeeff';
    const html =
      '<p>Call <b>Zorbleck</b> at <a href="https://ex.com/Zorbleck">the venue</a></p>' +
      '<ul class="tp-checks"><li data-checked="true"><p>Book it</p></li></ul>' +
      '<a class="tp-att" href="/api/files/1" data-id="1" data-name="Zorbleck.pdf" title="Zorbleck.pdf">Zorbleck.pdf</a>';
    const out = scrambleHtml(html, k);
    expect(out).not.toMatch(/>[^<]*Zorbleck/);
    expect(out).not.toContain('data-name="Zorbleck.pdf"');
    expect(out).not.toContain('title="Zorbleck.pdf"');
    // The link's target and the structure are as they were.
    expect(out).toContain('href="https://ex.com/Zorbleck"');
    expect(out).toContain('<ul class="tp-checks"><li data-checked="true"><p>');
    expect(out).toContain('<b>' + scrambleText(Z, k) + '</b>');
    expect(out).toContain('data-id="1"');
    // The input is a string; nothing to mutate, and the same in gives the same out.
    expect(scrambleHtml(html, k)).toBe(out); // What comes out is cleaned again: nothing the cleaner wouldn't keep survives the round trip.
    const bad = scrambleHtml(
      '<p>a</p><img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a>',
      k,
    );
    expect(bad).not.toMatch(/onerror|<script|<img|javascript:/i);
  });

  it('C23-U05 off by default; on writes a key and sets html[data-scrambled]; another window turns it on here; blocked storage still works', () => {
    expect(readScramble().on).toBe(false);
    expect(document.documentElement.hasAttribute('data-scrambled')).toBe(false);
    const { result } = renderHook(() => useScramble());
    expect(result.current.on).toBe(false);
    on();
    expect(result.current.on).toBe(true);
    expect(localStorage.getItem(SCRAMBLE_STORAGE_KEY)).toMatch(/^[0-9a-f]{32}$/);
    expect(document.documentElement.hasAttribute('data-scrambled')).toBe(true);
    act(() => setScramble(false));
    expect(localStorage.getItem(SCRAMBLE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute('data-scrambled')).toBe(false);
    // Another window (the note window, the menu bar sheet) switched it: one storage event and it's on here.
    localStorage.setItem(SCRAMBLE_STORAGE_KEY, 'ab'.repeat(16));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SCRAMBLE_STORAGE_KEY }));
    });
    expect(result.current).toEqual({ on: true, key: 'ab'.repeat(16) });
    // Storage blocked (a private window): it lasts for the visit.
    act(() => setScramble(false));
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      on();
      expect(result.current.on).toBe(true);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it('C23-U06 useMine: as it is when off; jumbled when on; every user re-renders when it flips', () => {
    function Line({ text }: { text: string }) {
      const mine = useMine();
      return <span>{mine(text)}</span>;
    }
    render(
      <>
        <Line text={`Call ${Z}`} />
        <Line text={Z} />
      </>,
    );
    expect(screen.getAllByText(new RegExp(Z))).toHaveLength(2);
    on();
    expect(screen.queryAllByText(new RegExp(Z))).toHaveLength(0);
    expect(screen.getByText(scrambleText(Z, key()))).toBeInTheDocument();
    act(() => setScramble(false));
    expect(screen.getAllByText(new RegExp(Z))).toHaveLength(2);
  });

  it('C23-U07 useMineField: jumbled while blurred, real on focus, onChange gets real words, jumbled again after blur', async () => {
    const user = userEvent.setup();
    const saved: string[] = [];
    function Field() {
      const [v, setV] = useState(Z);
      const f = useMineField(v, { onBlur: () => saved.push(v) });
      return <input aria-label="Title" value={f.value} onChange={(e) => setV(e.target.value)} {...f.bind} />;
    }
    render(<Field />);
    const box = screen.getByRole('textbox', { name: 'Title' });
    on();
    expect(box).toHaveValue(scrambleText(Z, key()));
    await user.click(box);
    expect(box).toHaveValue(Z);
    await user.type(box, ' two');
    expect(box).toHaveValue(`${Z} two`);
    act(() => box.blur());
    expect(saved).toEqual([`${Z} two`]);
    expect(box).toHaveValue(scrambleText(`${Z} two`, key()));
  });

  it('C23-U08 AccountMenu: the row sits under Theme with its line; flipping it switches the mode and keeps the menu open', async () => {
    const user = userEvent.setup();
    render(<AccountMenu me={{ name: `Rohit ${Z}`, email: `${Z}@ex.com`, initials: 'RZ' }} />);
    await user.click(screen.getByRole('button', { name: /^You:/ }));
    const menu = await screen.findByRole('menu', { name: 'You' });
    const text = menu.textContent ?? '';
    expect(text.indexOf('Theme')).toBeLessThan(text.indexOf('Scramble my text'));
    expect(text.indexOf('Scramble my text')).toBeLessThan(text.indexOf('Settings'));
    expect(menu).toHaveTextContent('Hides your words for screenshots');
    expect(menu).toHaveTextContent(`Rohit ${Z}`);
    const sw = screen.getByRole('switch', { name: 'Scramble my text' });
    expect(sw).not.toBeChecked();
    await user.click(sw);
    expect(readScramble().on).toBe(true);
    expect(screen.getByRole('menu', { name: 'You' })).toBeInTheDocument();
    expect(sw).toBeChecked();
    // Your own name and email in the menu jumble too; the menu's words don't.
    expect(menu).not.toHaveTextContent(Z);
    expect(menu).toHaveTextContent('Settings');
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Settings', 'Sign out']);
  });

  it('C23-U09 TopBar: no pill when off; a Scrambled pill when on; clicking it turns the mode off', async () => {
    const user = userEvent.setup();
    render(<TopBar onNewTask={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Scrambled/ })).toBeNull();
    on();
    const pill = screen.getByRole('button', { name: 'Scrambled: turn Scramble my text off' });
    expect(pill).toHaveTextContent('Scrambled');
    await user.click(pill);
    expect(readScramble().on).toBe(false);
    expect(screen.queryByRole('button', { name: /^Scrambled/ })).toBeNull();
  });

  const SURFACES: Array<[string, () => ReactNode]> = [
    [
      'TaskLine',
      () => <TaskLine task={{ key: 't', title: `Call ${Z}`, project: { name: Z, color: '#888' } }} />,
    ],
    ['PersonDot', () => <PersonDot person={{ name: `${Z} Smith`, initials: 'ZS' }} />],
    [
      'SpaceSwitch',
      () => <SpaceSwitch spaces={[{ id: 's', name: `${Z} Farm`, color: '#888' }]} active="s" />,
    ],
    ['NoteRow', () => <NoteRow note={{ id: 'n', title: `${Z} plan`, where: `${Z} / Planning` }} />],
    [
      'JiraPreview',
      () => (
        <JiraPreview
          today="2026-11-12"
          issue={{ key: 'ME-41', summary: `Fix ${Z}`, assignee: { name: `${Z} Lee`, initials: 'ZL' } }}
        />
      ),
    ],
    [
      'MenuBarRow',
      () => <MenuBarRow row={{ key: 'r', title: `Ring ${Z}`, project: { name: Z, color: '#888' } }} />,
    ],
    ['RichTextContent', () => <RichTextContent html={`<p>Notes about ${Z}</p>`} />],
  ];

  it.each(SURFACES)(
    'C23-U10 %s draws the person’s words jumbled when on, and as they are when off',
    (_, ui) => {
      const { container } = render(<>{ui()}</>);
      const all = () =>
        `${container.textContent} ${[...container.querySelectorAll('[title]')].map((e) => e.getAttribute('title')).join(' ')}`;
      expect(all()).toMatch(/Zorbleck|ZS|ZL/);
      on();
      expect(all()).not.toContain(Z);
      act(() => setScramble(false));
      expect(all()).toMatch(/Zorbleck|ZS|ZL/);
    },
  );

  it('C23-U10 a photo becomes a block: html[data-scrambled] is the CSS hook, the img stays for layout', () => {
    render(<PersonDot person={{ name: 'A', image: 'data:image/png;base64,AA==' }} />);
    on();
    expect(document.documentElement).toHaveAttribute('data-scrambled');
    expect(document.querySelector('.tp-pdot.tp-photo img')).not.toBeNull();
  });

  it('C23-U11 RichTextEditor: a jumbled read-only copy while on and blurred; a click brings the live editor with the real words; only real words are saved', async () => {
    const user = userEvent.setup();
    const blurs: string[] = [];
    render(
      <>
        <RichTextEditor
          variant="notes"
          label="Notes"
          value={`<p>About ${Z}</p>`}
          onBlur={(h) => blurs.push(h)}
        />
        <button type="button">elsewhere</button>
      </>,
    );
    const host = () => document.querySelector('.tp-rte')!;
    expect(host()).toHaveTextContent(`About ${Z}`);
    on();
    const veil = document.querySelector('.tp-rte-veil .tp-rte-area')!;
    expect(veil).not.toBeNull();
    expect(veil.textContent).toBe(scrambleText(`About ${Z}`, key()));
    expect(document.querySelector('.tp-rte-host[hidden]')).not.toBeNull();
    fireEvent.mouseDown(veil);
    await vi.waitFor(() => expect(document.querySelector('.tp-rte-veil')).toBeNull());
    expect(document.querySelector('.tp-rte-host:not([hidden]) .ProseMirror')).toHaveTextContent(`About ${Z}`);
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    await vi.waitFor(() => expect(document.querySelector('.tp-rte-veil')).not.toBeNull());
    for (const h of blurs) expect(h).toContain(Z);
  });

  it('C23-U12 the Send feedback form, Already reported and Your reports keep real words with the mode on', () => {
    on();
    render(
      <>
        <FeedbackDialog
          open
          inline
          kind="bug"
          filing="github"
          text={`It broke on ${Z}`}
          shot={null}
          details
          detailsLine="Tudu 0.38.0"
          scrambled
        />
        <SimilarReports
          state="ready"
          issues={[
            {
              number: 64,
              title: `${Z} count stuck`,
              url: 'https://github.com/x/y/issues/64',
              state: 'open',
              createdAt: '2026-10-24T10:00:00.000Z',
              closedAt: null,
              plusOnes: 0,
            },
          ]}
        />
        <FeedbackReports
          state="ready"
          reports={[
            {
              id: 'r',
              kind: 'bug',
              title: `${Z} report`,
              state: 'none',
              issue: null,
              createdAt: '2026-11-12T10:00:00.000Z',
              plusOneOf: null,
            },
          ]}
        />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'What happened?' })).toHaveValue(`It broke on ${Z}`);
    expect(screen.getByText(`${Z} count stuck`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${Z} report`))).toBeInTheDocument();
  });
});
