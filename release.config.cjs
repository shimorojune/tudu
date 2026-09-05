/** @type {import('semantic-release').GlobalConfig} */
module.exports = {
  branches: ["master"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          { type: "feat", release: "minor" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "revert", release: "patch" },
          { breaking: true, release: "major" },
        ],
      },
    ],
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "node scripts/sync-version.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "CHANGELOG.md",
          "package.json",
          "apps/*/package.json",
          "packages/*/package.json",
          "apps/desktop/src-tauri/tauri.conf.json",
          "apps/desktop/src-tauri/Cargo.toml",
          "apps/desktop/src-tauri/Cargo.lock",
        ],
        message:
          "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}",
      },
    ],
    [
      "@semantic-release/github",
      {
        draftRelease: true,
      },
    ],
  ],
};
