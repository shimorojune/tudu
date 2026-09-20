#!/usr/bin/env node

import { execSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const emDash = "\u2014";

try {
  const output = execSync(
    `rg -n --hidden --glob '!.git' --glob '!node_modules' --glob '!dist' --glob '!design' --glob '!pnpm-lock.yaml' --glob '!*.png' --glob '!*.icns' --glob '!*.ico' --glob '!*.zip' --glob '!*.dmg' --glob '!target' '${emDash}' .`,
    { cwd: root, encoding: "utf8" },
  );

  if (output.trim()) {
    console.error("Em-dash found in the following files:");
    console.error(output);
    process.exit(1);
  }
} catch (error) {
  const execError = error;

  if (execError.status === 1 && !execError.stdout?.trim()) {
    console.log("No em-dashes found.");
    process.exit(0);
  }

  if (execError.status === 1 && execError.stdout?.trim()) {
    console.error("Em-dash found in the following files:");
    console.error(execError.stdout);
    process.exit(1);
  }

  throw error;
}

console.log("No em-dashes found.");
