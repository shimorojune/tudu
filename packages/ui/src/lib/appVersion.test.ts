import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./appVersion";

describe("APP_VERSION", () => {
  it("matches packages/ui/package.json", () => {
    const packagePath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../package.json",
    );
    const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
      version: string;
    };

    expect(APP_VERSION).toBe(pkg.version);
  });
});
