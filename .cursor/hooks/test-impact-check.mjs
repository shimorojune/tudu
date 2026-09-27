#!/usr/bin/env node
import { execSync } from "node:child_process";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function listChangedFiles() {
  const tracked = execSync("git diff --name-only HEAD", {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const untracked = execSync("git ls-files --others --exclude-standard", {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set([...tracked, ...untracked])];
}

function isSourceFile(path) {
  if (!path.startsWith("apps/") && !path.startsWith("packages/")) {
    return false;
  }
  if (path.includes(".test.") || path.startsWith("apps/e2e/")) {
    return false;
  }
  return /\.(ts|tsx|js|jsx|css|scss)$/.test(path);
}

function isTestFile(path) {
  return (
    path.includes(".test.") ||
    path.startsWith("apps/e2e/tests/") ||
    path.startsWith("apps/e2e/helpers/")
  );
}

const input = await readStdin();
void input;

const files = listChangedFiles();
const sourceTouched = files.filter(isSourceFile);
const testsTouched = files.filter(isTestFile);

if (sourceTouched.length > 0 && testsTouched.length === 0) {
  const payload = {
    followup_message:
      "Test impact review required: source under apps/ or packages/ changed without any test or e2e updates. Add, edit, or delete tests, run pnpm verify (and pnpm test:e2e if user-visible), then include a Test impact table. If no test change is truly needed, state why explicitly.",
  };
  process.stdout.write(JSON.stringify(payload));
}
