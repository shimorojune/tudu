#!/usr/bin/env node
// Set the release's version in package.json: the macOS app takes its version from there (tauri.conf.json).
// semantic-release runs this before it commits the release (release.config.cjs).
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: sync-version.mjs 0.37.0');
  process.exit(1);
}
const path = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(path, 'utf8'));
pkg.version = version;
writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`package.json is ${version}`);
