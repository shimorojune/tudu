import type { BuildTrack } from '@tudu/core';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';

export interface VersionLinkProps {
  /** The app's name: "Tudu", or "Tudu Staging" in the Mac app's staging track. */
  name: string;
  version: string;
  track: BuildTrack;
  /** The release on GitHub; without one (dev, Tudu Test) the version is plain text. */
  href?: string | null;
  className?: string;
}

export const STAGING_TIP = 'Staging build · opens its release on GitHub';

/**
 * Which Tudu this is, as one quiet line: "Tudu 0.37.0". With a release it is a link and an arrow slides in on hover;
 * a staging build puts a small amber dot before the name and says so in the tooltip.
 */
export function VersionLink({ name, version, track, href, className }: VersionLinkProps) {
  const staging = track === 'staging';
  const inner = (
    <>
      {staging ? <span className="tp-ver-dot" aria-hidden="true" /> : null}
      <span className="tp-ver-name">{name}</span>
      <span className="tp-ver-num">{version}</span>
      {href ? <Icon name="external" size={13} className="tp-ver-arrow" /> : null}
    </>
  );
  if (!href)
    return (
      <span className={cx('tp-root tp-ver', className)} data-track={track}>
        {inner}
      </span>
    );
  return (
    <a
      className={cx('tp-root tp-ver tp-ver-link', staging && 'tp-tip tp-above', className)}
      data-track={track}
      data-tip={staging ? STAGING_TIP : undefined}
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={`${name} ${version}${staging ? ', a staging build' : ''}. Open its release on GitHub`}
    >
      {inner}
    </a>
  );
}
