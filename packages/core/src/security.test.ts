import { describe, expect, it } from 'vitest';
import { upgradeChips } from './attachments';
import { browserOf, osOf } from './feedback';
import { normalSite, siteHost, trimSlashes } from './jira';
import { cleanHtml, isEmptyHtml, noteHtml, stripTags, textOf, toHtml } from './notes';
import { EMAIL_PATTERN } from './spaces';
import { notesHtml, versionIn } from './versions';

/** Runs `f` and fails when it takes long: each input below took seconds before the patterns were rewritten. */
function quick<T>(f: () => T): T {
  const t = performance.now();
  const out = f();
  expect(performance.now() - t).toBeLessThan(100);
  return out;
}

describe('SEC-U01 email pattern', () => {
  it('SEC-U01 accepts addresses and refuses the rest', () => {
    for (const ok of ['rohit@tudu.app', 'a.b+c@mail.co.uk', 'x@y.z'])
      expect(EMAIL_PATTERN.test(ok)).toBe(true);
    for (const bad of ['a@b', 'a@.b', 'a b@c.d', 'a@b@c.d', '@b.c', 'a@b.c.'])
      expect(EMAIL_PATTERN.test(bad)).toBe(false);
  });
  it('SEC-U01 is quick on a long run of dots', () => {
    expect(quick(() => EMAIL_PATTERN.test('!@!' + '!.'.repeat(25000) + ' '))).toBe(false);
  });
});

describe('SEC-U02 stripTags', () => {
  it('SEC-U02 strips every tag, a split one too', () => {
    expect(stripTags('<p>a<b>b</b></p>')).toBe('ab');
    expect(stripTags('<scr<b>ipt>x')).toBe('x');
    expect(stripTags('<p>a</p><p>b</p>', ' ')).toBe(' a  b ');
  });
  it('SEC-U02 is quick on a long run of <', () => {
    const s = '<'.repeat(50000);
    expect(quick(() => stripTags(s))).toBe(s);
  });
});

describe('SEC-U03 textOf', () => {
  it('SEC-U03 unescapes once', () => {
    expect(textOf('<p>&amp;lt;b&amp;gt;</p>')).toBe('&lt;b&gt;');
    expect(textOf('<p>a &lt; b &amp; c</p>')).toBe('a < b & c');
  });
});

describe('SEC-U04 noteHtml and isEmptyHtml', () => {
  it('SEC-U04 drops trailing empty paragraphs as before', () => {
    expect(noteHtml('<p>a</p><p></p><p></p>')).toBe('<p>a</p>');
    expect(isEmptyHtml('<p><br></p>')).toBe(true);
  });
  it('SEC-U04 is quick on long runs', () => {
    quick(() => noteHtml('<p></p>'.repeat(10000) + 'x'));
    expect(quick(() => isEmptyHtml('<'.repeat(50000)))).toBe(false);
  });
});

describe('SEC-U05 cleanHtml comments', () => {
  it('SEC-U05 an unclosed comment runs to the end', () => {
    expect(cleanHtml('<p>a<!-- b</p>')).toBe('<p>a</p>');
  });
  it('SEC-U05 is quick on many open comments and junk tags', () => {
    quick(() => cleanHtml('<!--'.repeat(20000)));
    quick(() => cleanHtml('<!x'.repeat(20000)));
  });
});

describe('SEC-U06 toHtml', () => {
  it('SEC-U06 tells words from HTML', () => {
    expect(toHtml('a < b')).toBe('<p>a &lt; b</p>');
    expect(toHtml('<p>x</p>')).toBe('<p>x</p>');
  });
  it('SEC-U06 is quick on many <a', () => {
    expect(quick(() => toHtml('<a'.repeat(25000))).startsWith('<p>&lt;a')).toBe(true);
  });
});

describe('SEC-U07 Jira site', () => {
  it('SEC-U07 trims as before', () => {
    expect(normalSite(' https://j.io/?x#y ')).toBe('https://j.io');
    expect(normalSite('https://j.io///')).toBe('https://j.io');
    expect(siteHost('https://j.io/')).toBe('j.io');
    expect(trimSlashes('a//')).toBe('a');
  });
  it('SEC-U07 is quick on a long run of slashes', () => {
    const s = '/'.repeat(50000) + 'x';
    quick(() => normalSite(s));
    quick(() => siteHost(s));
  });
});

describe('SEC-U08 release notes', () => {
  it('SEC-U08 is quick on long runs', () => {
    expect(quick(() => versionIn('9'.repeat(50000)))).toBeNull();
    quick(() => notesHtml('## ' + ' '.repeat(50000) + 'x\n* ' + ' '.repeat(50000) + 'y'));
  });
  it('SEC-U08 drops commit references without leaving double spaces', () => {
    expect(notesHtml('* fix a thing ([abc1234](https://x/commit/abc1234))  now')).toBe(
      '<ul><li>fix a thing now</li></ul>',
    );
  });
});

describe('SEC-U09 user agents', () => {
  it('SEC-U09 is quick on long runs', () => {
    expect(quick(() => osOf('iPad'.repeat(12500)))).toBe('Unknown');
    expect(quick(() => browserOf('Version/9' + '9'.repeat(50000)))).toBe('Unknown');
  });
  it('SEC-U09 still reads iOS and Safari', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    expect(osOf(ua)).toBe('iOS 18.1');
    expect(browserOf(ua)).toBe('Safari 18.1');
  });
});

describe('SEC-U10 chip titles', () => {
  it('SEC-U10 a name with a quote stays escaped in the title', () => {
    const out = upgradeChips(
      '<a class="tp-att" href="/api/files/f1" data-id="f1" data-name="a &quot;b&quot;.pdf" data-size="10"><span>x</span></a>',
    );
    expect(out).toContain('title="a &quot;b&quot;.pdf"');
    expect(out).not.toMatch(/title="a "/);
  });
});
