/**
 * Releases (the Release workflow, by hand): the next version from the conventional commits since the last tag
 * (tudu-0.36.0 and up), the changelog, the version into package.json (the app's version), and a draft GitHub release
 * that the workflow fills with the signed macOS app and publishes once production is deployed.
 * @type {import('semantic-release').GlobalConfig}
 */
module.exports = {
  branches: ['master'],
  tagFormat: 'tudu-${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          { breaking: true, release: 'major' },
        ],
      },
    ],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    ['@semantic-release/exec', { prepareCmd: 'node scripts/sync-version.mjs ${nextRelease.version}' }],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}',
      },
    ],
    ['@semantic-release/github', { draftRelease: true, successComment: false, failComment: false }],
  ],
};
