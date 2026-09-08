export const UPDATES_ASSET_NAME = "Tudu.app.tar.gz";
export const UPDATES_SIG_NAME = "Tudu.app.tar.gz.sig";
export const UPDATES_PLATFORM = "darwin-aarch64";

export type GitHubReleaseAsset = {
  name: string;
  url: string;
};

export type GitHubRelease = {
  tag_name: string;
  published_at: string;
  body: string | null;
  html_url: string;
  assets: GitHubReleaseAsset[];
};

export type TauriUpdateManifest = {
  version: string;
  notes: string;
  pub_date: string;
  release_url: string;
  platforms: Record<
    string,
    {
      signature: string;
      url: string;
    }
  >;
};

export function stripReleaseTag(tagName: string): string {
  if (tagName.startsWith("tudu-")) {
    return tagName.slice("tudu-".length);
  }
  return tagName.startsWith("v") ? tagName.slice(1) : tagName;
}

export function buildDownloadUrl(publicBaseUrl: string, assetName: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  return `${base}/updates/download/${assetName}`;
}

export function mapReleaseToManifest(
  release: GitHubRelease,
  signature: string,
  publicBaseUrl: string,
): TauriUpdateManifest | null {
  const bundleAsset = release.assets.find((asset) => asset.name === UPDATES_ASSET_NAME);
  if (!bundleAsset) {
    return null;
  }

  return {
    version: stripReleaseTag(release.tag_name),
    notes: release.body?.trim() || `Tudu ${stripReleaseTag(release.tag_name)}`,
    pub_date: release.published_at,
    release_url: release.html_url,
    platforms: {
      [UPDATES_PLATFORM]: {
        signature,
        url: buildDownloadUrl(publicBaseUrl, UPDATES_ASSET_NAME),
      },
    },
  };
}

export function findAssetByName(
  release: GitHubRelease,
  assetName: string,
): GitHubReleaseAsset | undefined {
  return release.assets.find((asset) => asset.name === assetName);
}
