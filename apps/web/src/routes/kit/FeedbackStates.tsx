import { FeedbackDialog, type FeedbackDialogProps, type FeedbackPhase } from '@tudu/ui';
import { type FeedbackKind, type MyReport, type SimilarIssue } from '@tudu/core';
import { useEffect, useState } from 'react';
import { Pair, Section } from './Pair';

const LINE = 'Tudu 0.38.0, macOS, the Today page. Never your tasks.';
const LINE_ISSUE = 'Tudu 0.38.0, macOS, the Today page. Shown on the issue. Never your tasks.';
const ISSUE = { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' };
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
const SIMILAR: SimilarIssue[] = [
  {
    number: 64,
    title: 'Jira count stuck at 1 with 2 assigned',
    url: 'https://github.com/shimorojune/tudu/issues/64',
    state: 'fixed',
    createdAt: day(12),
    closedAt: day(5),
    plusOnes: 2,
  },
  {
    number: 62,
    title: 'Jira pane should close on an outside click',
    url: 'https://github.com/shimorojune/tudu/issues/62',
    state: 'open',
    createdAt: day(14),
    closedAt: null,
    plusOnes: 0,
  },
];
const PLUS_ONE = { number: 64, url: 'https://github.com/shimorojune/tudu/issues/64#issuecomment-9001' };
const REPORTS: MyReport[] = [
  {
    id: 'k0',
    kind: 'bug',
    title: 'Jira count stuck at 1 with 2 assigned',
    createdAt: day(0),
    state: 'filed',
    issue: PLUS_ONE,
    plusOneOf: 64,
  },
  {
    id: 'k1',
    kind: 'bug',
    title: 'Dragging a task from Monday to Tuesday puts it back',
    createdAt: day(0),
    state: 'filed',
    issue: ISSUE,
  },
  {
    id: 'k2',
    kind: 'bug',
    title: 'The dock badge still says 2 after answering everything',
    createdAt: day(0),
    state: 'pending',
    issue: null,
  },
  {
    id: 'k3',
    kind: 'idea',
    title: 'Let me pin a task to the top of Today',
    createdAt: day(3),
    state: 'filed',
    issue: { number: 139, url: 'https://github.com/shimorojune/tudu/issues/139' },
  },
  {
    id: 'k4',
    kind: 'idea',
    title: 'A weekly summary email on Fridays',
    createdAt: day(9),
    state: 'none',
    issue: null,
  },
];

/** A stand-in screenshot: a small drawing of a Today sheet, as a file the dialog reads like a real one. */
const KIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f4f1ea"/><rect x="24" y="24" width="592" height="352" rx="14" fill="#fffdf8" stroke="#ddd6c8"/><text x="48" y="72" font-family="sans-serif" font-size="22" font-weight="600" fill="#18181b">Friday</text>${[
  0, 1, 2, 3,
]
  .map(
    (i) =>
      `<rect x="48" y="${104 + i * 56}" width="18" height="18" rx="5" fill="none" stroke="#a8a29e" stroke-width="2"/><rect x="80" y="${108 + i * 56}" width="${300 - i * 40}" height="10" rx="5" fill="#d6d0c4"/>`,
  )
  .join('')}</svg>`;

function kitShot(): File {
  return new File([KIT_SVG], 'Screenshot 2026-10-23.png', { type: 'image/svg+xml' });
}

/**
 * The same drawing as real PNG bytes, which the public switch needs (it only takes types GitHub shows). The HEIC one
 * is those bytes under a phone photo's name and type: the browser still draws it, the switch turns itself off.
 */
function kitPng(kind: 'png' | 'heic'): Promise<File> {
  return new Promise((done, fail) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = 400;
      c.getContext('2d')!.drawImage(img, 0, 0);
      c.toBlob((b) => {
        if (!b) return fail(new Error('no PNG'));
        done(
          kind === 'png'
            ? new File([b], 'Screenshot 2026-10-23.png', { type: 'image/png' })
            : new File([b], 'IMG_2041.HEIC', { type: 'image/heic' }),
        );
      }, 'image/png');
    };
    img.onerror = () => fail(new Error('no drawing'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(KIT_SVG)}`;
  });
}

/** One state of the form, holding its own draft so the kit's controls work. */
function Form({
  phase = 'idle',
  text = '',
  shot = false,
  isPublic = true,
  ...more
}: {
  phase?: FeedbackPhase;
  text?: string;
  /** `true` is the drawing; `png` and `heic` are real image bytes, for the as-it-is and lock lines. */
  shot?: boolean | 'png' | 'heic';
  /** Starts "File it as a public issue" off when false. */
  isPublic?: boolean;
} & Partial<Omit<FeedbackDialogProps, 'shot' | 'phase' | 'text' | 'public'>>) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [words, setWords] = useState(text);
  const [file, setFile] = useState<File | null>(() => (shot === true ? kitShot() : null));
  const [details, setDetails] = useState(true);
  const [pub, setPub] = useState(isPublic);
  const [picked, setPicked] = useState<SimilarIssue | null>(more.picked ?? null);
  useEffect(() => {
    if (shot !== 'png' && shot !== 'heic') return;
    let live = true;
    void kitPng(shot).then((f) => live && setFile(f));
    return () => {
      live = false;
    };
  }, [shot]);
  return (
    <FeedbackDialog
      open
      inline
      kind={kind}
      onKind={setKind}
      text={words}
      onText={setWords}
      shot={file}
      onShot={setFile}
      public={pub}
      onPublic={(on) => {
        setPub(on);
        if (!on) setPicked(null);
      }}
      details={details}
      onDetails={setDetails}
      detailsLine={more.filing === 'github' ? LINE_ISSUE : LINE}
      phase={phase}
      {...more}
      picked={picked}
      onPick={setPicked}
    />
  );
}

const WORDS = 'I ticked off “Call the venue” and it came back after a reload.';
const JIRA_WORDS = 'The Jira count in the sidebar says 1 but I have two tickets';

/** Send feedback: empty, with a screenshot, sending and sent, light and dark. Offline is the toast alone. */
export function FeedbackStates() {
  return (
    <Section
      id="send-feedback"
      title="Send feedback"
      lead="One small form for a bug or an idea: the words, one screenshot (picked, pasted or dropped) and the app details. Each report becomes a public GitHub issue and its number comes back; Your reports keeps them. Offline, it saves and says so in a toast."
    >
      <Pair title="Send feedback, empty" render={() => <Form />} />
      <Pair title="Send feedback, with a screenshot" render={() => <Form text={WORDS} shot />} />
      <Pair title="Send feedback, sending" render={() => <Form text={WORDS} phase="sending" />} />
      <Pair title="Send feedback, sent" render={() => <Form text={WORDS} phase="sent" />} />
      <Pair
        title="Send feedback, public on GitHub"
        note="Filed as public issues: the sub line, the footer's notice and the last row, File it as a public issue, say so, quietly."
        render={() => (
          <Form filing="github" text={WORDS} onReports={() => {}} reports={REPORTS} reportsState="ready" />
        )}
      />
      <Pair
        title="Send feedback, public with a screenshot"
        note="It goes on the issue exactly as added (#67): one warning line asks to check it shows nothing private. Scramble my text, in the menu, is how to hide words first."
        render={() => <Form filing="github" text={WORDS} shot="png" />}
      />
      <Pair
        title="Send feedback, not a public issue"
        note="File it as a public issue off (#50): the head line says by email, Already reported folds shut, the footer is a quiet lock, and the screenshot stays with the team."
        render={() => <Form filing="github" text={WORDS} shot="png" isPublic={false} />}
      />
      <Pair
        title="Send feedback, text scrambled"
        note="Scramble my text is on (#67): the hint by Add a screenshot says so. The form itself shows real words."
        render={() => <Form filing="github" text={WORDS} scrambled />}
      />
      <Pair
        title="Send feedback, checking for similar reports"
        note="The first look, 450ms after typing stops with three words or more: two shimmer rows."
        render={() => <Form filing="github" text={JIRA_WORDS} similar={{ state: 'loading', issues: [] }} />}
      />
      <Pair
        title="Send feedback, already reported?"
        note="Up to three issues, open and closed, closest first. +1 picks one; the arrow opens it on GitHub."
        render={() => (
          <Form
            filing="github"
            text={JIRA_WORDS}
            similar={{ state: 'ready', issues: SIMILAR }}
            onOpenIssue={() => {}}
          />
        )}
      />
      <Pair
        title="Send feedback, +1 that one instead"
        note="Picked: the row lifts with an ink ring, the bar says what happens, Send reads “+1 on #64”. Undo puts it back."
        render={() => (
          <Form
            filing="github"
            text={JIRA_WORDS}
            similar={{ state: 'ready', issues: SIMILAR }}
            picked={SIMILAR[0]}
            onOpenIssue={() => {}}
          />
        )}
      />
      <Pair
        title="Send feedback, couldn’t check for similar reports"
        note="The model is off or the issues haven’t been read yet: one quiet line; sending works as usual."
        render={() => <Form filing="github" text={JIRA_WORDS} similar={{ state: 'error', issues: [] }} />}
      />
      <Pair
        title="Send feedback, screenshot GitHub can’t show"
        note="A phone photo (HEIC): GitHub can’t draw it inline, so a lock line says it stays with the team."
        render={() => <Form filing="github" text={WORDS} shot="heic" />}
      />
      <Pair
        title="Send feedback, filing"
        render={() => <Form filing="github" text={WORDS} phase="sending" />}
      />
      <Pair
        title="Send feedback, filed"
        render={() => (
          <Form
            filing="github"
            text={WORDS}
            phase="filed"
            issue={ISSUE}
            onReports={() => {}}
            onOpenIssue={() => {}}
          />
        )}
      />
      <Pair
        title="Send feedback, issue to follow"
        render={() => <Form filing="github" text={WORDS} phase="pending" onReports={() => {}} />}
      />
      <Pair
        title="Send feedback, +1 sent"
        render={() => (
          <Form
            filing="github"
            text={JIRA_WORDS}
            phase="filed"
            issue={PLUS_ONE}
            picked={SIMILAR[0]}
            onReports={() => {}}
            onOpenIssue={() => {}}
          />
        )}
      />
      <Pair
        title="Send feedback, +1 to follow"
        render={() => (
          <Form filing="github" text={JIRA_WORDS} phase="pending" picked={SIMILAR[0]} onReports={() => {}} />
        )}
      />
      <Pair
        title="Send feedback, couldn’t send"
        render={() => (
          <Form
            filing="github"
            text={WORDS}
            error="That’s a lot of reports in an hour. Your words are kept; send it a little later."
          />
        )}
      />
      <Pair
        title="Your reports"
        render={() => <Form filing="github" view="reports" reports={REPORTS} reportsState="ready" />}
      />
      <Pair
        title="Your reports, loading"
        render={() => <Form filing="github" view="reports" reportsState="loading" />}
      />
      <Pair
        title="Your reports, empty"
        render={() => <Form filing="github" view="reports" reports={[]} reportsState="ready" />}
      />
      <Pair
        title="Your reports, couldn’t load"
        render={() => <Form filing="github" view="reports" reportsState="error" onRetryReports={() => {}} />}
      />
    </Section>
  );
}
