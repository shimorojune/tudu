import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchHit, markWords, type SearchItem } from './SearchHit';

const ITEM: SearchItem = {
  key: 'a',
  id: 'ME-65',
  title: 'Plan the team offsite agenda',
  where: { label: 'Today', tone: 'today' },
  project: { name: 'Northwind', color: '#3d5a80' },
  snippet: 'Ask about dietary needs for the dinner.',
};

describe('C07-U04 a search result', () => {
  it('a task: the ring, the title with the matched words marked, the note line, Today in the brand tone, the project dot, the ID', () => {
    render(<SearchHit item={ITEM} tokens={['dietary', 'plan']} />);
    const opt = screen.getByRole('option', { name: 'Plan the team offsite agenda, Today' });
    expect(opt).toHaveClass('tp-sh');
    expect(opt).not.toHaveClass('tp-done');
    expect(opt.querySelector('.tp-sh-mark i')).not.toBeNull();
    const marks = [...opt.querySelectorAll('mark.tp-hl')].map((m) => m.textContent);
    expect(marks).toEqual(['Plan', 'dietary']);
    expect(opt.querySelector('.tp-sh-snip')!.textContent).toBe('Ask about dietary needs for the dinner.');
    expect(opt.querySelector('.tp-sh-where')).toHaveClass('tp-today');
    expect(opt.querySelector('.tp-sh-proj')!.textContent).toBe('Northwind');
    expect(opt.querySelector<HTMLElement>('.tp-sh-dot')!.style.background).toBe('rgb(61, 90, 128)');
    expect(opt.querySelector('.tp-sh-id')!.textContent).toBe('ME-65');
    expect(opt).toHaveAttribute('aria-selected', 'false');
  });

  it('crossed off: the small tick and the muted look; no snippet or project when there are none; active is marked', () => {
    render(
      <SearchHit
        active
        item={{
          key: 'b',
          id: 'ME-33',
          title: 'Draft agenda',
          done: true,
          where: { label: 'Yesterday · crossed off' },
        }}
      />,
    );
    const opt = screen.getByRole('option');
    expect(opt).toHaveClass('tp-done');
    expect(opt).toHaveClass('tp-on');
    expect(opt).toHaveAttribute('aria-selected', 'true');
    expect(opt.querySelector('.tp-sh-mark svg')).not.toBeNull();
    expect(opt.querySelector('.tp-sh-snip')).toBeNull();
    expect(opt.querySelector('.tp-sh-proj')).toBeNull();
    expect(opt.querySelector('.tp-sh-where')).not.toHaveClass('tp-today');
    expect(opt.querySelector('.tp-sh-where')!.textContent).toBe('Yesterday · crossed off');
  });

  it('a recent search: the clock and the words; the Create row with its note; picking and hovering report', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onHover = vi.fn();
    render(
      <>
        <SearchHit query="release notes" onPick={onPick} />
        <SearchHit create="gutter" onHover={onHover} />
      </>,
    );
    const past = screen.getByRole('option', { name: 'release notes' });
    expect(past).toHaveClass('tp-sh-query');
    expect(past.querySelector('.tp-sh-mark svg')).not.toBeNull();
    await user.click(past);
    expect(onPick).toHaveBeenCalledTimes(1);
    const create = screen.getByRole('option', { name: /^Create “gutter”/ });
    expect(create).toHaveClass('tp-sh-create');
    expect(create.querySelector('.tp-sh-title b')!.textContent).toBe('“gutter”');
    await user.hover(create);
    expect(onHover).toHaveBeenCalled();
  });

  it('marks the longest word first and leaves text alone without words', () => {
    const { container } = render(<span>{markWords('Meera and Meerkats', ['meer', 'meera'])}</span>);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Meera', 'Meer']);
    expect(markWords('plain', [])).toBe('plain');
    expect(markWords('a.b', ['.'])).not.toBe('a.b');
  });
});

describe('C13-U05 a close match from another space', () => {
  it('names the space with its tile before where it lives; a row in this space names none', () => {
    render(
      <SearchHit item={{ ...ITEM, snippet: null, space: { name: 'Home', color: '#8a5a00' } }} tokens={[]} />,
    );
    const by = document.querySelector('.tp-sh-by')!;
    expect(by.querySelector('.tp-sh-space')?.textContent).toBe('Home');
    expect((by.querySelector('.tp-sh-tile') as HTMLElement).style.background).toMatch(
      /rgb\(138, 90, 0\)|#8a5a00/,
    );
    expect(by.textContent).toMatch(/^HomeToday/);
    render(<SearchHit item={{ ...ITEM, key: 'b', snippet: null }} />);
    expect(document.querySelectorAll('.tp-sh-space')).toHaveLength(1);
  });
});
