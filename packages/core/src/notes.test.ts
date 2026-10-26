import { describe, expect, it } from 'vitest';
import { cleanHtml, isEmptyHtml, textOf } from './notes';

describe('C03-U24 cleaning notes', () => {
  it('C03-U24 keeps the tags the editor makes', () => {
    const html =
      '<h2>Plan</h2><p>Meera wants a <strong>yes or no</strong> by <em>Monday</em>, <u>really</u> <s>soon</s> <mark>now</mark> <code>x</code> <sup>2</sup><sub>3</sub>.</p>' +
      '<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol><blockquote><p>Quoted</p></blockquote><pre><code>code</code></pre><hr>' +
      '<ul data-type="taskList" class="tp-checks"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Pull the branch</p></div></li></ul>' +
      '<p style="text-align: center">Centred</p>';
    expect(cleanHtml(html)).toBe(
      '<h2>Plan</h2><p>Meera wants a <strong>yes or no</strong> by <em>Monday</em>, <u>really</u> <s>soon</s> <mark>now</mark> <code>x</code> <sup>2</sup><sub>3</sub>.</p>' +
        '<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol><blockquote><p>Quoted</p></blockquote><pre><code>code</code></pre><hr>' +
        '<ul data-type="taskList" class="tp-checks"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" disabled="" checked=""><span></span></label><div><p>Pull the branch</p></div></li></ul>' +
        '<p style="text-align: center">Centred</p>',
    );
  });

  it('C03-U24 keeps safe links and nothing else about them', () => {
    expect(cleanHtml('<a href="https://x.y/spec" onclick="steal()" id="z">spec</a>')).toBe(
      '<a href="https://x.y/spec" rel="noopener noreferrer" target="_blank">spec</a>',
    );
    expect(cleanHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a>bad</a>');
    expect(cleanHtml('<a href="mailto:a@b.c">mail</a>')).toBe(
      '<a href="mailto:a@b.c" rel="noopener noreferrer" target="_blank">mail</a>',
    );
  });

  it('C03-U24 strips scripts, styles, frames, event handlers and unknown tags, keeping their words', () => {
    expect(cleanHtml('<p>Hi<script>alert(1)</script> there</p>')).toBe('<p>Hi there</p>');
    expect(cleanHtml('<style>p{}</style><p>Words</p><!-- c -->')).toBe('<p>Words</p>');
    expect(cleanHtml('<p onmouseover="x()">Hover</p>')).toBe('<p>Hover</p>');
    expect(cleanHtml('<iframe src="https://x"></iframe><table><tr><td>cell</td></tr></table>')).toBe('cell');
    expect(cleanHtml('<img src=x onerror="alert(1)"><p>after</p>')).toBe('<p>after</p>');
    expect(cleanHtml('<p style="color:red">Red</p>')).toBe('<p>Red</p>');
  });

  it('C03-U24 balances what is left and keeps entities', () => {
    expect(cleanHtml('<p>Open <strong>bold')).toBe('<p>Open <strong>bold</strong></p>');
    expect(cleanHtml('stray</em> words')).toBe('stray words');
    expect(cleanHtml('<p>a &amp; b &lt; c &copy; 1 < 2</p>')).toBe('<p>a &amp; b &lt; c &copy; 1 &lt; 2</p>');
  });

  it('C03-U24 knows an empty note and reads the words out', () => {
    expect(isEmptyHtml('')).toBe(true);
    expect(isEmptyHtml('<p></p>')).toBe(true);
    expect(isEmptyHtml('<p><br></p>')).toBe(true);
    expect(isEmptyHtml('<p>&nbsp;</p>')).toBe(true);
    expect(isEmptyHtml('<p>x</p>')).toBe(false);
    expect(textOf('<p>One &amp; two</p><ul><li>Three</li></ul>')).toBe('One & two\nThree');
  });
});

describe('C04-U13 attachment chips survive the cleaner', () => {
  it('C04-U13 keeps the chip with its id, name, size and title, and nothing else', () => {
    const chip =
      '<a class="tp-att" href="/api/files/abc-123" data-id="abc-123" data-name="spec.pdf" data-size="248000" onclick="x()" title="t"><span class="tp-att-i"></span>spec.pdf<span class="tp-att-s">242 KB</span></a>';
    expect(cleanHtml(`<p>See ${chip}</p>`)).toBe(
      '<p>See <a class="tp-att" data-type="attachment" contenteditable="false" href="/api/files/abc-123" target="_blank" data-id="abc-123" data-name="spec.pdf" data-size="248000" title="t"><span class="tp-att-i"></span>spec.pdf<span class="tp-att-s">242 KB</span></a></p>',
    );
    expect(cleanHtml('<a class="tp-att" href="https://evil/x" data-id="../x">bad</a>')).toBe(
      '<a class="tp-att" data-type="attachment" contenteditable="false" href="https://evil/x" rel="noopener noreferrer" target="_blank">bad</a>',
    );
  });
});

describe('C22-U06 a note body is cleaned like task notes', () => {
  it('C22-U06 keeps checklists, files and links and drops scripts, handlers and unknown tags', () => {
    const body =
      '<h2>Five interviews</h2><ul data-type="taskList" class="tp-checks"><li data-type="taskItem" data-checked="false"><p>Draft it</p></li></ul>' +
      '<p><a class="tp-att" data-id="f1" data-name="notes.pdf" data-size="2048" href="/api/files/f1">notes.pdf</a> ' +
      '<a href="https://tudu.app" onclick="x()">site</a></p><script>steal()</script><img src=x onerror="alert(1)"><marquee>hi</marquee>';
    const out = cleanHtml(body);
    expect(out).toContain('data-type="taskList"');
    expect(out).toContain('data-checked="false"');
    expect(out).toContain('href="/api/files/f1"');
    expect(out).toContain('data-id="f1"');
    expect(out).toContain('href="https://tudu.app" rel="noopener noreferrer" target="_blank"');
    expect(out).not.toMatch(/script|onerror|onclick|<img|marquee|steal/);
    expect(out).toContain('hi');
  });
});
