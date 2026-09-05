#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const version = process.argv[2];

if (!version) {
  console.error("Usage: node scripts/sync-version.mjs <version>");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

function updatePackageJson(filePath) {
  const pkg = JSON.parse(readFileSync(filePath, "utf8"));
  pkg.version = version;
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`Updated ${filePath}`);
}

function walkForPackageJson(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (!stat.isDirectory()) {
      continue;
    }

    if (entry === "node_modules" || entry === "dist" || entry === "src-tauri") {
      continue;
    }

    const packageJsonPath = join(fullPath, "package.json");
    try {
      statSync(packageJsonPath);
      updatePackageJson(packageJsonPath);
    } catch {
      // no package.json in this directory
    }

    walkForPackageJson(fullPath);
  }
}

updatePackageJson(join(root, "package.json"));
walkForPackageJson(join(root, "apps"));
walkForPackageJson(join(root, "packages"));

const tauriConfigPath = join(
  root,
  "apps/desktop/src-tauri/tauri.conf.json",
);
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
tauriConfig.version = version;
writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);
console.log(`Updated ${tauriConfigPath}`);

const cargoTomlPath = join(root, "apps/desktop/src-tauri/Cargo.toml");
let cargoToml = readFileSync(cargoTomlPath, "utf8");
cargoToml = cargoToml.replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);
writeFileSync(cargoTomlPath, cargoToml);
console.log(`Updated ${cargoTomlPath}`);

const cargoLockPath = join(root, "apps/desktop/src-tauri/Cargo.lock");
let cargoLock = readFileSync(cargoLockPath, "utf8");
cargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "tudu"\n)version = ".*"/,
  `$1version = "${version}"`,
);
writeFileSync(cargoLockPath, cargoLock);
console.log(`Updated ${cargoLockPath}`);

console.log(`Synced version ${version} across the monorepo.`);
