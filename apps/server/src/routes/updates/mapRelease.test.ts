import { describe, expect, it } from "vitest";
import {
  buildDownloadUrl,
  mapReleaseToManifest,
  stripReleaseTag,
  UPDATES_ASSET_NAME,
  UPDATES_PLATFORM,
  UPDATES_SIG_NAME,
  type GitHubRelease,
} from "./mapRelease.js";

const sampleRelease: GitHubRelease = {
  tag_name: "v0.9.1",
  published_at: "2026-09-07T10:00:00.000Z",
  body: "Bug fixes",
  html_url: "https://github.com/eGainDev/tudu/releases/tag/v0.9.1",
  assets: [
    {
      name: UPDATES_SIG_NAME,
      url: "https://api.github.com/repos/eGainDev/tudu/releases/assets/1",
    },
    {
      name: UPDATES_ASSET_NAME,
      url: "https://api.github.com/repos/eGainDev/tudu/releases/assets/2",
    },
  ],
};

describe("stripReleaseTag", () => {
  it("removes a leading v", () => {
    expect(stripReleaseTag("v0.9.1")).toBe("0.9.1");
  });

  it("leaves tags without v unchanged", () => {
    expect(stripReleaseTag("0.9.1")).toBe("0.9.1");
  });
});

describe("buildDownloadUrl", () => {
  it("builds a public download URL", () => {
    expect(buildDownloadUrl("https://api.tudu.ezdev.net", UPDATES_ASSET_NAME)).toBe(
      "https://api.tudu.ezdev.net/updates/download/Tudu.app.tar.gz",
    );
  });

  it("strips a trailing slash from the base URL", () => {
    expect(buildDownloadUrl("https://api.tudu.ezdev.net/", UPDATES_ASSET_NAME)).toBe(
      "https://api.tudu.ezdev.net/updates/download/Tudu.app.tar.gz",
    );
  });
});

describe("mapReleaseToManifest", () => {
  it("maps a GitHub release to Tauri manifest JSON", () => {
    const manifest = mapReleaseToManifest(
      sampleRelease,
      "signed-payload",
      "https://api.tudu.ezdev.net",
    );

    expect(manifest).toEqual({
      version: "0.9.1",
      notes: "Bug fixes",
      pub_date: "2026-09-07T10:00:00.000Z",
      release_url: "https://github.com/eGainDev/tudu/releases/tag/v0.9.1",
      platforms: {
        [UPDATES_PLATFORM]: {
          signature: "signed-payload",
          url: "https://api.tudu.ezdev.net/updates/download/Tudu.app.tar.gz",
        },
      },
    });
  });

  it("returns null when the bundle asset is missing", () => {
    const manifest = mapReleaseToManifest(
      { ...sampleRelease, assets: [] },
      "signed-payload",
      "https://api.tudu.ezdev.net",
    );

    expect(manifest).toBeNull();
  });
});
