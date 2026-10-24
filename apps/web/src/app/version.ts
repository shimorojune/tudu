import { releaseUrl, type BuildTrack } from '@tudu/core';
import type { VersionLinkProps } from '@tudu/ui';
import type { AppInfo } from './desktop';

/** The version this build is: the release's, set by Vite from package.json, or the staging build's from CI. */
export const APP_VERSION: string = (import.meta.env.VITE_TUDU_VERSION as string | undefined) ?? '0.0.0';

const TRACKS: BuildTrack[] = ['production', 'staging', 'test', 'dev'];
const SET_TRACK = import.meta.env.VITE_TUDU_TRACK as string | undefined;

/** Which build this is: what CI set, else the dev server is `dev` and any other build `production`. */
export const BUILD_TRACK: BuildTrack =
  SET_TRACK && (TRACKS as string[]).includes(SET_TRACK)
    ? (SET_TRACK as BuildTrack)
    : import.meta.env.DEV
      ? 'dev'
      : 'production';

/**
 * The version at the foot of Settings. In the Mac app it is the app's own (what the updater moves), from the bridge;
 * on the web it is the build's. Dev builds say so and link nowhere.
 */
export function appVersion(
  info: Pick<AppInfo, 'name' | 'version' | 'track'> | null,
  build: { version: string; track: BuildTrack } = { version: APP_VERSION, track: BUILD_TRACK },
): VersionLinkProps {
  if (info) return { ...info, href: releaseUrl(info.track, info.version) };
  const version = build.track === 'dev' ? `${build.version}-dev` : build.version;
  return { name: 'Tudu', version, track: build.track, href: releaseUrl(build.track, build.version) };
}
