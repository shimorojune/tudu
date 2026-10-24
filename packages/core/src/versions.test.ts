import { describe, expect, it } from 'vitest';
import {
  TRACKS,
  compareVersions,
  notesHtml,
  readyText,
  readyWords,
  releaseUrl,
  stagingVersion,
  trackName,
  versionIn,
} from './index';

describe('Versions and tracks (chunk 11)', () => {
  it('C11-U01 ready words, staging order, release notes and the tracks', () => {
    expect(readyWords('0.38.0')).toBe('Tudu is ready: version 0.38.0');
    expect(readyWords('0.38.1-staging.4', 'Tudu Staging')).toBe(
      'Tudu Staging is ready: version 0.38.1-staging.4',
    );
    expect(readyText('0.38.0')).toBe('is ready: version 0.38.0');

    // Each staging build is newer than the last and older than the next release.
    const order = ['0.36.1-staging.130', '0.36.1-staging.131', '0.37.0', '0.37.1-staging.132', '0.38.0'];
    for (let i = 1; i < order.length; i++) expect(compareVersions(order[i - 1]!, order[i]!)).toBeLessThan(0);
    expect(compareVersions('0.36.1-staging.9', '0.36.1-staging.10')).toBeLessThan(0);
    expect(compareVersions('tudu-0.37.0', '0.37.0')).toBe(0);
    expect(() => compareVersions('soon', '0.37.0')).toThrow();
    expect(stagingVersion('0.37.0', 132)).toBe('0.37.1-staging.132');
    expect(versionIn('tudu-0.37.0')).toBe('0.37.0');
    expect(versionIn('Tudu Staging 0.37.1-staging.4')).toBe('0.37.1-staging.4');
    expect(versionIn('staging')).toBeNull();

    // semantic-release's notes: the version heading goes, sections are bold lines, bullets a list, links words.
    const md = [
      '## [0.38.0](https://github.com/eGainDev/tudu/compare/tudu-0.37.0...tudu-0.38.0) (2026-10-30)',
      '',
      '### Features',
      '',
      '* **desktop:** the floating bar remembers your draft ([a1b2c3d](https://github.com/eGainDev/tudu/commit/a1b2c3d))',
      '* search finds `NW-12` by key',
      '',
      '### Bug Fixes',
      '',
      '- inbox counts <now> follow [live updates](https://example.com) (#12)',
      'A closing line',
      'that wraps.',
    ].join('\n');
    expect(notesHtml(md)).toBe(
      '<p><strong>Features</strong></p>' +
        '<ul><li><strong>desktop:</strong> the floating bar remembers your draft</li><li>search finds NW-12 by key</li></ul>' +
        '<p><strong>Bug Fixes</strong></p>' +
        '<ul><li>inbox counts &lt;now&gt; follow live updates (#12)</li></ul>' +
        '<p>A closing line that wraps.</p>',
    );
    expect(notesHtml('')).toBe('');
    expect(notesHtml(null)).toBe('');

    expect(trackName('production')).toBe('Tudu');
    expect(trackName('staging')).toBe('Tudu Staging');
    expect(trackName('test')).toBe('Tudu Test');
    expect(Object.values(TRACKS).map((t) => t.identifier)).toEqual([
      'net.ezdev.tudu',
      'net.ezdev.tudu.staging',
      'net.ezdev.tudu.test',
    ]);
  });
});

describe('The version in Settings (chunk 09)', () => {
  it('C09-U10 a build links to its release: the tag, the rolling staging release, or nothing', () => {
    const releases = 'https://github.com/shimorojune/tudu/releases';
    expect(releaseUrl('production', '0.37.0')).toBe(`${releases}/tag/tudu-0.37.0`);
    expect(releaseUrl('staging', '0.37.1-staging.132')).toBe(`${releases}#release-staging`);
    expect(releaseUrl('staging', '0.37.1-staging+3f9c2ab')).toBe(`${releases}#release-staging`);
    expect(releaseUrl('test', '0.37.1')).toBeNull();
    expect(releaseUrl('dev', '0.37.0-dev')).toBeNull();
    expect(releaseUrl('production', 'not a version')).toBeNull();
  });
});
