// Run: node scripts/design-sync.js
// Clears design/, unzips design/Tudu.zip into it, deletes the zip.
const { existsSync, rmSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const DESIGN_DIR = "/Users/rraj/Documents/work/tudu/design";
const ZIP_PATH = join(DESIGN_DIR, "Tudu.zip");

if (!existsSync(ZIP_PATH)) {
    console.error(`No zip found at ${ZIP_PATH}`);
    process.exit(1);
}

// Delete everything in design/ except the zip itself.
const { readdirSync } = require("node:fs");
for (const name of readdirSync(DESIGN_DIR)) {
    if (name === "Tudu.zip") continue;
    rmSync(join(DESIGN_DIR, name), { recursive: true, force: true });
}

execFileSync("unzip", ["-o", ZIP_PATH, "-d", DESIGN_DIR], { stdio: "inherit" });
rmSync(ZIP_PATH, { force: true });

console.log(`Synced ${DESIGN_DIR}`);