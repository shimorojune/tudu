import { FeedbackDialog, type FeedbackDialogProps, type FeedbackPhase } from '@tudu/ui';
import type { FeedbackKind, MyReport } from '@tudu/core';
import { useEffect, useState } from 'react';
import { Pair, Section } from './Pair';

const LINE = 'Tudu 0.38.0, macOS, the Today page. Never your tasks.';
const LINE_ISSUE = 'Tudu 0.38.0, macOS, the Today page. Shown on the issue. Never your tasks.';
const ISSUE = { number: 142, url: 'https://github.com/shimorojune/tudu/issues/142' };
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
const REPORTS: MyReport[] = [
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
  shown = false,
  ...more
}: {
  phase?: FeedbackPhase;
  text?: string;
  /** `true` is the drawing; `png` and `heic` are real image bytes, for the public switch. */
  shot?: boolean | 'png' | 'heic';
  shown?: boolean;
} & Partial<Omit<FeedbackDialogProps, 'shot' | 'phase' | 'text'>>) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [words, setWords] = useState(text);
  const [file, setFile] = useState<File | null>(() => (shot === true ? kitShot() : null));
  const [details, setDetails] = useState(true);
  const [shotPublic, setShotPublic] = useState(shown);
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
      onShot={(f) => {
        setFile(f);
        setShotPublic(false);
      }}
      shotPublic={shotPublic}
      onShotPublic={setShotPublic}
      details={details}
      onDetails={setDetails}
      detailsLine={more.filing === 'github' ? LINE_ISSUE : LINE}
      phase={phase}
      {...more}
    />
  );
}

const WORDS = 'I ticked off “Call the venue” and it came back after a reload.';

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
        note="Filed as public issues: the sub line, the footer's notice and the screenshot hint say so, quietly."
        render={() => (
          <Form filing="github" text={WORDS} onReports={() => {}} reports={REPORTS} reportsState="ready" />
        )}
      />
      <Pair
        title="Send feedback, screenshot kept private"
        note="A screenshot in, the switch under it starts off: it goes to the team with the report, never on the issue."
        render={() => <Form filing="github" text={WORDS} shot="png" />}
      />
      <Pair
        title="Send feedback, screenshot shown on the issue"
        note="Switched on: the Public pill and the accent ring say so on the preview, and the line under the switch changes."
        render={() => <Form filing="github" text={WORDS} shot="png" shown />}
      />
      <Pair
        title="Send feedback, screenshot GitHub can’t show"
        note="A phone photo (HEIC): GitHub can’t draw it inline, so the switch is off and can’t be turned on."
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
