import { describe, expect, it } from 'vitest';
import { declarationsFor, parseRules, readStylesheet } from '../test-utils/stylesheet';

// jsdom has no layout and no Tailwind preflight, so these read the prose rules themselves: a missing list style (the
// preflight's `list-style: none` would win) or a chip that may wrap fails here without a browser.
const rules = parseRules(readStylesheet('components.css'));

function prose(html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tp-root tp-prose';
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('C03-U25 list styles', () => {
  it('C03-U25 bullets are disc, circle, square; numbers are decimal then letters; a checklist has none; markers are readable', () => {
    const el = prose(
      '<ul id="u1"><li>a<ul id="u2"><li>b<ul id="u3"><li>c</li></ul></li></ul></li></ul>' +
        '<ol id="o1"><li>a<ol id="o2"><li>b</li></ol></li></ol>' +
        '<ul id="c1" class="tp-checks" data-type="taskList"><li data-checked="false">x</li></ul>',
    );
    const ls = (id: string) => declarationsFor(rules, el.querySelector(`#${id}`)!)['list-style'];
    expect(ls('u1')).toBe('disc');
    expect(ls('u2')).toBe('circle');
    expect(ls('u3')).toBe('square');
    expect(ls('o1')).toBe('decimal');
    expect(ls('o2')).toBe('lower-alpha');
    expect(ls('c1')).toBe('none');
    expect(declarationsFor(rules, el.querySelector('#u1 > li')!)['padding-left']).toBe('2px');
    // markers: the readable muted tone, never the faint decoration one
    const marker = rules.filter((r) => /\.tp-prose (ul|ol) > li::marker/.test(r.selector));
    expect(marker.map((r) => r.declarations.color)).toEqual([
      'var(--muted-foreground)',
      'var(--muted-foreground)',
    ]);
    el.remove();
  });
});

describe('C04-U20 the chip stays on one line', () => {
  it('C04-U20 the chip never wraps: capped width, the stem cut with an ellipsis, the extension and size kept whole', () => {
    const el = prose(
      '<p><a class="tp-att" href="/api/files/f1" data-name="WhatsApp Image.jpeg"><span class="tp-att-i"></span><span class="tp-att-n"><span class="tp-att-stem">WhatsApp Image</span><span class="tp-att-ext">.jpeg</span></span><span class="tp-att-s">242 KB</span></a></p>',
    );
    const d = (sel: string) => declarationsFor(rules, el.querySelector(sel)!);
    const chip = d('a.tp-att');
    expect(chip['white-space']).toBe('nowrap');
    expect(chip['overflow-wrap']).toBe('normal');
    expect(chip['max-width']).toBe('min(100%, 340px)');
    expect(chip.height).toBe('26px');
    expect(chip['box-sizing']).toBe('border-box');
    expect(chip.color).toBe('var(--foreground)');
    expect(chip['text-decoration']).toBe('none');
    expect(d('.tp-att-stem')).toMatchObject({
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'min-width': '0',
    });
    expect(d('.tp-att-ext').flex).toBe('none');
    expect(d('.tp-att-s').flex).toBe('none');
    // an image gets the picture mark
    expect(d('.tp-att-i')['mask-image']).toBe('var(--tp-pic)');
    el.remove();
  });
});
