import {
  FEEDBACK_IMAGE_MAX,
  fileSize,
  shotCanBePublic,
  type FeedbackIssue,
  type FeedbackKind,
  type MyReport,
  type SimilarIssue,
} from '@tudu/core';
import { Popover } from 'radix-ui';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { FeedbackReports, type FeedbackReportsState } from './FeedbackReports';
import { IssueLink } from './IssueLink';
import { Segmented, type SegmentedItem } from './Segmented';
import { SettingRow } from './SettingsSection';
import { SimilarReports, type SimilarReportsState } from './SimilarReports';
import { Switch } from './Switch';

/** The form, then: sending, sent (by email only), filed (with its issue) or pending (the issue follows). */
export type FeedbackPhase = 'idle' | 'sending' | 'sent' | 'filed' | 'pending';

export interface FeedbackDialogProps {
  open: boolean;
  onClose?: () => void;
  kind: FeedbackKind;
  onKind?: (kind: FeedbackKind) => void;
  text: string;
  onText?: (text: string) => void;
  /** The one screenshot, as the person picked, pasted or dropped it. */
  shot: File | null;
  onShot?: (file: File | null) => void;
  /**
   * "File it as a public issue" (GitHub filing only, #50): on for each new report; off sends it by email only. The
   * screenshot goes wherever the report goes.
   */
  public?: boolean;
  onPublic?: (on: boolean) => void;
  /** Scramble my text is on (#67): the hint by Add a screenshot says so. The form itself is never scrambled. */
  scrambled?: boolean;
  details: boolean;
  onDetails?: (on: boolean) => void;
  /** What the details are: "Tudu 0.38.0, macOS, the Today page. Never your tasks." */
  detailsLine: string;
  phase?: FeedbackPhase;
  onSend?: () => void;
  /** Where reports go: a public GitHub issue (the form says so, quietly), or only by email as before. */
  filing?: 'github' | 'email';
  /** The report's issue, once filed. */
  issue?: FeedbackIssue | null;
  /** A refusal a retry won't fix: a warning line above the footer, the words kept. */
  error?: string | null;
  /** Your reports, inside the form. */
  view?: 'form' | 'reports';
  reports?: MyReport[];
  reportsState?: FeedbackReportsState;
  onReports?: () => void;
  onBack?: () => void;
  onRetryReports?: () => void;
  /** Open on GitHub: a new tab, or the browser from the Mac app. */
  onOpenIssue?: (url: string) => void;
  /** "Already reported?" (#76, GitHub filing only): issues that mean what is being typed. */
  similar?: { state: SimilarReportsState; issues: SimilarIssue[]; stale?: boolean };
  /** The issue picked for "+1 that one instead": Send adds the report to it as a comment. */
  picked?: SimilarIssue | null;
  onPick?: (issue: SimilarIssue | null) => void;
  /** A sheet from the bottom on phones. */
  variant?: 'dialog' | 'sheet';
  /** Drawn in place without the veil (the kit). */
  inline?: boolean;
}

const KINDS: SegmentedItem<FeedbackKind>[] = [
  { value: 'bug', label: 'Something’s wrong' },
  { value: 'idea', label: 'An idea' },
];

/** How long the shimmer shows at least, so a quick read still reads as loading rather than a flash. */
const SHIMMER_MS = 380;
/** The slot's fold, as the CSS draws it. */
const FOLD_MS = 300;

const CLIP = (
  <svg
    width={14}
    height={14}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);

/** A pasted image arrives as "image.png": it reads better as what it is. */
function shotName(file: File): string {
  return file.name && file.name !== 'image.png' ? file.name : 'Pasted image.png';
}

/**
 * Send feedback, as K-Feedback draws it: what kind, the words, one screenshot and the app details. The screenshot
 * slot opens on a shimmer while the file reads, then the picture fades in; × folds it away. The draft lives with the
 * caller, so closing keeps it.
 */
export function FeedbackDialog({
  open,
  onClose,
  kind,
  onKind,
  text,
  onText,
  shot,
  onShot,
  public: isPublic = true,
  onPublic,
  scrambled = false,
  details,
  onDetails,
  detailsLine,
  phase = 'idle',
  onSend,
  variant = 'dialog',
  inline,
  filing = 'email',
  issue = null,
  error = null,
  view = 'form',
  reports = [],
  reportsState = 'loading',
  onReports,
  onBack,
  onRetryReports,
  onOpenIssue,
  similar,
  picked = null,
  onPick,
}: FeedbackDialogProps) {
  // Each of these belongs to one screenshot, so a new one starts over without resetting anything.
  const [read, setRead] = useState<{ file: File; url: string } | null>(null);
  const [readyFor, setReadyFor] = useState<File | null>(null);
  const [leavingFor, setLeavingFor] = useState<File | null>(null);
  const url = shot && read?.file === shot ? read.url : null;
  const ready = !!shot && readyFor === shot;
  const leaving = !!shot && leavingFor === shot;
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Read the screenshot for its preview: the shimmer for a moment at least, then the picture.
  useEffect(() => {
    if (!shot) return;
    let live = true;
    const t0 = Date.now();
    const rd = new FileReader();
    rd.onload = () => {
      const wait = Math.max(0, SHIMMER_MS - (Date.now() - t0));
      setTimeout(() => {
        if (live) setRead({ file: shot, url: String(rd.result) });
      }, wait);
    };
    rd.readAsDataURL(shot);
    return () => {
      live = false;
    };
  }, [shot]);

  const take = (file: File | null | undefined) => {
    setOver(false);
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setHint('That’s not an image. Add a screenshot or a photo.');
      return;
    }
    if (file.size > FEEDBACK_IMAGE_MAX) {
      setHint('That image is over 10 MB. Try a smaller one.');
      return;
    }
    setHint(null);
    const named = shotName(file) === file.name ? file : new File([file], shotName(file), { type: file.type });
    onShot?.(named);
  };
  const remove = () => {
    setLeavingFor(shot);
    setTimeout(() => onShot?.(null), FOLD_MS);
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.clipboardData.files).find((f) => /^image\//.test(f.type));
    if (!file) return;
    e.preventDefault();
    take(file);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    take(e.dataTransfer.files[0]);
  };

  const shown = !!shot && !leaving;
  const github = filing === 'github';
  // Filed as a public issue: the server files on GitHub and the person left the switch on.
  const pub = github && isPublic;
  // Only kinds GitHub shows inline go on the issue; anything else stays with the team, and the form says so.
  const canShow = !!shot && shotCanBePublic(shot.type);
  const sheet = variant === 'sheet';
  const ask = kind === 'bug' ? 'What happened?' : 'What would help?';
  const placeholder =
    (kind === 'bug'
      ? 'What you did, what you expected, what happened instead.'
      : 'What you’d like Tudu to do, and what it would save you.') +
    (pub ? ' Leave out anything private.' : '');
  const busy = phase === 'sending' || phase === 'sent';
  const plusOne = pub && picked ? picked : null;
  const mineCount = reportsState === 'ready' && reports.length > 0 ? ` · ${reports.length}` : '';

  let head: { title: string; sub: ReactNode; description?: string };
  let footer: ReactNode;
  let body: ReactNode = null;
  if (view === 'reports') {
    head = { title: 'Your reports', sub: 'What you’ve sent, newest first.' };
    footer = (
      <>
        <Button variant="quiet" size="sm" icon={<Icon name="left" size={14} />} onClick={onBack}>
          Back
        </Button>
        <span className="tp-fb-sp" />
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </>
    );
    body = <FeedbackReports state={reportsState} reports={reports} onRetry={onRetryReports} />;
  } else if (phase === 'filed' && issue) {
    head = plusOne
      ? {
          title: `Thanks, it’s on #${issue.number}`,
          sub: 'Your words are on the issue as a comment. Follow it there.',
        }
      : { title: 'Thanks, it’s filed', sub: 'Follow it on GitHub for replies and the fix.' };
    footer = (
      <>
        {sheet || !onReports ? null : (
          <Button variant="quiet" size="sm" onClick={onReports}>
            Your reports
          </Button>
        )}
        <span className="tp-fb-sp" />
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="external" size={14} />}
          onClick={() => onOpenIssue?.(issue.url)}
        >
          Open on GitHub
        </Button>
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </>
    );
    body = (
      <div className="tp-root tp-fb-done">
        <span className="tp-fb-tick" aria-hidden="true">
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className="tp-fb-num">
          #{issue.number}
          <small>
            {plusOne ? `+1 · ${plusOne.title}` : kind === 'bug' ? 'Something’s wrong' : 'An idea'}
          </small>
        </div>
        {sheet ? null : <p className="tp-fb-gist">{text.trim()}</p>}
        <IssueLink url={issue.url} />
        {sheet ? null : <p className="tp-fb-small">It’s kept under Your reports, here in this form.</p>}
      </div>
    );
  } else if (phase === 'pending') {
    head = {
      title: 'Thanks, it’s sent',
      sub: plusOne
        ? 'The GitHub comment follows in a few minutes.'
        : 'The GitHub issue follows in a few minutes.',
    };
    footer = (
      <>
        {onReports ? (
          <Button variant="quiet" size="sm" onClick={onReports}>
            Your reports
          </Button>
        ) : null}
        <span className="tp-fb-sp" />
        <Button size="sm" onClick={onClose}>
          Done
        </Button>
      </>
    );
    body = (
      <div className="tp-root tp-fb-done">
        <span className="tp-fb-wait" aria-hidden="true">
          <Icon name="clock" size={20} />
        </span>
        <p className="tp-fb-gist">
          GitHub didn’t answer just now. Your report is safe with the team and gets filed by itself; its
          number shows under Your reports when it’s there.
        </p>
      </div>
    );
  } else {
    head = {
      title: 'Send feedback',
      sub: github ? (
        // Both lines share one cell and crossfade when "File it as a public issue" flips.
        <span className={cx('tp-fb-xf', !pub && 'tp-alt')}>
          <span className="tp-fb-xf-a" aria-hidden={!pub}>
            It’s filed as a public issue on GitHub, so you can follow it.
          </span>
          <span className="tp-fb-xf-b" aria-hidden={pub}>
            It goes straight to the people who make Tudu, by email.
          </span>
        </span>
      ) : (
        'It goes straight to the people who make Tudu.'
      ),
      description: github
        ? pub
          ? 'It’s filed as a public issue on GitHub, so you can follow it.'
          : 'It goes straight to the people who make Tudu, by email.'
        : undefined,
    };
    footer = (
      <>
        {pub ? <PublicNotice key="pub" /> : github ? <TeamNotice key="team" /> : null}
        <span className="tp-fb-sp" />
        <Button variant="quiet" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          icon={<Icon name={plusOne ? 'check' : 'send'} size={14} />}
          disabled={!text.trim() && phase === 'idle'}
          loading={phase === 'sending'}
          loadingLabel={plusOne ? 'Adding…' : pub ? 'Filing…' : 'Sending…'}
          success={phase === 'sent'}
          successLabel="Sent"
          onClick={() => {
            if (phase === 'idle' && text.trim()) onSend?.();
          }}
        >
          {plusOne ? `+1 on #${plusOne.number}` : 'Send'}
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={head.title}
      sub={head.sub}
      description={head.description}
      variant={variant}
      inline={inline}
      noFocus={inline}
      footer={footer}
    >
      {body ?? (
        <div
          className={cx('tp-fb-drop', over && 'tp-over')}
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes('Files')) return;
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={onDrop}
          data-over={over ? 'true' : undefined}
        >
          <div className={cx('tp-root tp-fb', busy && 'tp-busy')}>
            <Segmented label="Kind of feedback" items={KINDS} value={kind} onChange={(k) => onKind?.(k)} />
            <div>
              <label className="tp-fb-l" htmlFor="tp-fb-text">
                {ask}
              </label>
              <textarea
                id="tp-fb-text"
                className="tp-fb-text"
                placeholder={placeholder}
                value={text}
                maxLength={5000}
                onChange={(e) => onText?.(e.target.value)}
                onPaste={onPaste}
                autoFocus={!inline}
              />
            </div>
            {github && similar ? (
              <SimilarReports
                // Off folds it shut: Already reported is about GitHub.
                state={pub ? similar.state : 'hidden'}
                issues={similar.issues}
                stale={similar.stale}
                picked={pub ? picked : null}
                onPick={onPick}
                onOpen={onOpenIssue}
              />
            ) : null}
            <div className={cx('tp-fb-slot', !shown && 'tp-hide')} aria-hidden={!shown} inert={!shown}>
              <div>
                {shot ? (
                  <figure className="tp-fb-shot">
                    <div
                      className={cx('tp-fb-shot-img', ready && 'tp-ready')}
                      role="img"
                      aria-label={`Preview of ${shot.name}`}
                    >
                      {url ? <img src={url} alt="" onLoad={() => setReadyFor(shot)} /> : null}
                    </div>
                    <button
                      type="button"
                      className="tp-fb-shot-x"
                      aria-label="Remove the screenshot"
                      onClick={remove}
                    >
                      <Icon name="x" size={13} />
                    </button>
                    <figcaption>
                      <span className="tp-fb-nm">{shot.name}</span>
                      <span className="tp-fb-sz">{fileSize(shot.size)}</span>
                    </figcaption>
                  </figure>
                ) : null}
                {shot && pub ? (
                  canShow ? (
                    <p className="tp-fb-asis tp-warn">
                      <Icon name="warning" size={13} />
                      <span>It goes on the issue as it is. Check it shows nothing private.</span>
                    </p>
                  ) : (
                    <p className="tp-fb-asis">
                      <Icon name="lock" size={13} />
                      <span>GitHub can’t show this kind of image. It stays with the team.</span>
                    </p>
                  )
                ) : null}
              </div>
            </div>
            <div className={cx('tp-fb-slot', shown && 'tp-hide')} aria-hidden={shown} inert={shown}>
              <div>
                <div className="tp-fb-att">
                  <Button variant="secondary" size="sm" icon={CLIP} onClick={() => picker.current?.click()}>
                    Add a screenshot
                  </Button>
                  <span className={cx('tp-fb-hint', hint && 'tp-warn')} role={hint ? 'status' : undefined}>
                    {hint ??
                      (scrambled ? (
                        <>
                          <Icon name="shuffle" size={12} />
                          Your text is scrambled
                        </>
                      ) : (
                        'or paste or drop one'
                      ))}
                  </span>
                  <input
                    ref={picker}
                    type="file"
                    className="tp-fb-file"
                    accept="image/*"
                    tabIndex={-1}
                    aria-label="Choose a screenshot"
                    onChange={(e) => {
                      take(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </div>
            <SettingRow
              className="tp-fb-details"
              title="Include app details"
              sub={detailsLine}
              control={
                <Switch label="Include app details" checked={details} onChange={(v) => onDetails?.(v)} />
              }
            />
            {github ? (
              <SettingRow
                className="tp-fb-pubrow"
                title="File it as a public issue"
                sub={
                  <span className={cx('tp-fb-xf', !pub && 'tp-alt')}>
                    <span className="tp-fb-xf-a" aria-hidden={!pub}>
                      On GitHub, where you can follow it and others can +1.
                    </span>
                    <span className="tp-fb-xf-b" aria-hidden={pub}>
                      Off. It goes to the Tudu team by email, nothing is public.
                    </span>
                  </span>
                }
                control={
                  <Switch label="File it as a public issue" checked={pub} onChange={(v) => onPublic?.(v)} />
                }
              />
            ) : null}
            {github && onReports ? (
              <button type="button" className="tp-fb-mine" onClick={onReports}>
                Your reports{mineCount}
                <Icon name="right" size={12} />
              </button>
            ) : null}
            {plusOne ? (
              <div className="tp-fb-inst" role="status">
                <span>
                  Adds your words to <b>#{plusOne.number}</b>
                  {sheet ? '' : ' as a comment'}. No new issue.
                </span>
                <button type="button" className="tp-fb-undo" onClick={() => onPick?.(null)}>
                  Undo
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="tp-fb-err" role="alert">
                <Icon name="warning" size={15} />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** The footer's quiet "Public on GitHub": a small popover says what is public, what stays with the team, and what never goes. */
function PublicNotice() {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx('tp-fb-pub', open && 'tp-on')}
          aria-label="Public on GitHub: what’s shared"
          aria-expanded={open ? 'true' : 'false'}
          aria-haspopup="dialog"
        >
          <Icon name="globe" size={13} />
          <span>Public on GitHub</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="tp-root tp-pop tp-fb-pop"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          aria-label="What’s shared"
        >
          <h4>Public on GitHub</h4>
          <ul>
            <li>What you write</li>
            <li>Bug or idea</li>
            <li>App details, when switched on: version, system, page, window, theme</li>
            <li>
              <span>
                The screenshot
                <em>Exactly as you added it</em>
              </span>
            </li>
          </ul>
          <h4>Only the Tudu team</h4>
          <ul className="tp-fb-priv">
            <li>Your name and email (so we can reply)</li>
          </ul>
          <p>
            Never sent anywhere: your tasks, notes, people or space names, except what your screenshot shows.{' '}
            <b>Scramble my text</b>, in your menu, hides your words before you take one.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The footer with "File it as a public issue" off: a quiet lock, not a button, since there is nothing to explain. */
function TeamNotice() {
  return (
    <span className="tp-fb-pub tp-fb-team">
      <Icon name="lock" size={13} />
      <span>Only the Tudu team</span>
    </span>
  );
}
