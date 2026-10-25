import { describe, expect, it } from 'vitest';
import { chipHtml, pastedFileName, splitFileName, upgradeChips } from './attachments';
import { cleanHtml, noteHtml, textOf, toHtml } from './notes';

describe('C04-U18 file names split', () => {
  it('C04-U18 splits a name before its extension; dotfiles, bare names and long tails stay whole', () => {
    expect(splitFileName('WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg')).toEqual({
      stem: 'WhatsApp Image 2026-08-05 at 4.29.27 PM',
      ext: '.jpeg',
    });
    expect(splitFileName('archive.tar.gz')).toEqual({ stem: 'archive.tar', ext: '.gz' });
    expect(splitFileName('.env')).toEqual({ stem: '.env', ext: '' });
    expect(splitFileName('README')).toEqual({ stem: 'README', ext: '' });
    expect(splitFileName('notes.markdown')).toEqual({ stem: 'notes', ext: '.markdown' });
    expect(splitFileName('notes.markdown1')).toEqual({ stem: 'notes.markdown1', ext: '' });
    expect(splitFileName('trailing.')).toEqual({ stem: 'trailing.', ext: '' });
    expect(splitFileName('v1. final draft')).toEqual({ stem: 'v1. final draft', ext: '' });
  });
});

describe('C04-U19 pasted names', () => {
  const at = new Date(2026, 9, 24, 14, 32);
  it('C04-U19 a screenshot from the clipboard is named for when it was pasted; a real name is kept', () => {
    expect(pastedFileName('image.png', 'image/png', at)).toBe('Pasted image 24 Oct 14.32.png');
    expect(pastedFileName('', 'image/jpeg', at)).toBe('Pasted image 24 Oct 14.32.jpeg');
    expect(pastedFileName('IMAGE.JPG', 'image/jpeg', at)).toBe('Pasted image 24 Oct 14.32.jpg');
    expect(pastedFileName('', 'application/octet-stream', at)).toBe('Pasted image 24 Oct 14.32');
    expect(pastedFileName('spec.pdf', 'application/pdf', at)).toBe('spec.pdf');
    expect(pastedFileName('image of the venue.png', 'image/png', at)).toBe('image of the venue.png');
    expect(pastedFileName('image.png', 'image/png', new Date(2026, 0, 3, 9, 5))).toBe(
      'Pasted image 3 Jan 09.05.png',
    );
  });
});

describe('C04-U20 the chip markup', () => {
  it('C04-U20 the shared chip has the stem, extension, size and the full name as its title, and survives the cleaner', () => {
    const chip = chipHtml({ id: 'f1', name: 'WhatsApp Image <1>.jpeg', size: 248_000 });
    expect(chip).toBe(
      '<a class="tp-att" href="/api/files/f1" data-id="f1" data-name="WhatsApp Image &lt;1&gt;.jpeg" data-size="248000" title="WhatsApp Image &lt;1&gt;.jpeg">' +
        '<span class="tp-att-i"></span><span class="tp-att-n"><span class="tp-att-stem">WhatsApp Image &lt;1&gt;</span><span class="tp-att-ext">.jpeg</span></span><span class="tp-att-s">242 KB</span></a>',
    );
    const cleaned = cleanHtml(`<p>${chip}</p>`);
    expect(cleaned).toContain('<span class="tp-att-stem">WhatsApp Image &lt;1&gt;</span>');
    expect(cleaned).toContain('<span class="tp-att-ext">.jpeg</span>');
    expect(cleaned).toContain('title="WhatsApp Image &lt;1&gt;.jpeg"');
    // no extension: the stem alone
    expect(chipHtml({ id: 'f2', name: 'README', size: 10 })).toContain(
      '<span class="tp-att-n"><span class="tp-att-stem">README</span></span>',
    );
  });

  it('C04-U20 an old chip with a bare name is redrawn with the new markup; other words are left alone', () => {
    const old =
      '<p>Plan: <a class="tp-att" data-type="attachment" contenteditable="false" href="/api/files/f1" target="_blank" data-id="f1" data-name="Q3 plan &amp; budget.pdf" data-size="2048"><span class="tp-att-i"></span>Q3 plan &amp; budget.pdf<span class="tp-att-s">2 KB</span></a> and <a href="https://x.y">a link</a></p>';
    const up = upgradeChips(old);
    expect(up).toBe(
      '<p>Plan: <a class="tp-att" data-type="attachment" contenteditable="false" href="/api/files/f1" target="_blank" data-id="f1" data-name="Q3 plan &amp; budget.pdf" data-size="2048" title="Q3 plan &amp; budget.pdf">' +
        '<span class="tp-att-i"></span><span class="tp-att-n"><span class="tp-att-stem">Q3 plan &amp; budget</span><span class="tp-att-ext">.pdf</span></span><span class="tp-att-s">2 KB</span></a> and <a href="https://x.y">a link</a></p>',
    );
    // already new: the same again
    expect(upgradeChips(up)).toBe(up);
  });
});

describe('C04-U21 the cleaner and new chips', () => {
  it('C04-U21 keeps the new chip spans and title, nothing else new; an uploading chip goes with what is inside it', () => {
    expect(
      cleanHtml(
        '<span class="tp-att-n">a</span><span class="tp-att-stem">b</span><span class="tp-att-ext">.c</span>',
      ),
    ).toBe(
      '<span class="tp-att-n">a</span><span class="tp-att-stem">b</span><span class="tp-att-ext">.c</span>',
    );
    expect(cleanHtml('<span class="tp-att-x">a</span><span title="t">b</span><p title="t">c</p>')).toBe(
      '<span>a</span><span>b</span><p>c</p>',
    );
    expect(
      cleanHtml(
        '<p>Before <span data-tp-upload="u1" class="tp-att"><span class="tp-att-n"><span>shot.png</span></span><span>40%</span></span> after</p>',
      ),
    ).toBe('<p>Before  after</p>');
    expect(cleanHtml('<p>a<span data-tp-upload="u2"></span>b</p>')).toBe('<p>ab</p>');
    // the content of dropped tags is still dropped when they nest
    expect(cleanHtml('<p>x<svg><svg></svg>hidden</svg>y</p>')).toBe('<p>xy</p>');
  });
});

describe('C04-A09 request notes are HTML (the pure part)', () => {
  it('C04-A09 a note is stored cleaned; plain words become paragraphs; an empty one is nothing', () => {
    expect(noteHtml('<ol><li><p>One</p></li><li><p>Two</p></li></ol><script>x()</script>')).toBe(
      '<ol><li><p>One</p></li><li><p>Two</p></li></ol>',
    );
    expect(noteHtml('Bring the badge\n\nAnd the laptop')).toBe('<p>Bring the badge</p><p>And the laptop</p>');
    expect(noteHtml('<p></p>')).toBe('');
    expect(noteHtml('<ul><li><p>One</p></li></ul><p></p>')).toBe('<ul><li><p>One</p></li></ul>');
    expect(noteHtml('   ')).toBe('');
    expect(noteHtml(undefined)).toBe('');
    expect(textOf(toHtml('<ol><li><p>One</p></li><li><p>Two</p></li></ol>'))).toBe('One\nTwo');
  });
});
