import { FeedbackDialog, type FeedbackPhase } from '@tudu/ui';
import type { FeedbackKind } from '@tudu/core';
import { useState } from 'react';
import { Pair, Section } from './Pair';

const LINE = 'Tudu 0.38.0, macOS, the Today page. Never your tasks.';

/** A stand-in screenshot: a small drawing of a Today sheet, as a file the dialog reads like a real one. */
function kitShot(): File {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#f4f1ea"/><rect x="24" y="24" width="592" height="352" rx="14" fill="#fffdf8" stroke="#ddd6c8"/><text x="48" y="72" font-family="sans-serif" font-size="22" font-weight="600" fill="#18181b">Friday</text>${[
    0, 1, 2, 3,
  ]
    .map(
      (i) =>
        `<rect x="48" y="${104 + i * 56}" width="18" height="18" rx="5" fill="none" stroke="#a8a29e" stroke-width="2"/><rect x="80" y="${108 + i * 56}" width="${300 - i * 40}" height="10" rx="5" fill="#d6d0c4"/>`,
    )
    .join('')}</svg>`;
  return new File([svg], 'Screenshot 2026-10-23.png', { type: 'image/svg+xml' });
}

/** One state of the form, holding its own draft so the kit's controls work. */
function Form({
  phase = 'idle',
  text = '',
  shot = false,
}: {
  phase?: FeedbackPhase;
  text?: string;
  shot?: boolean;
}) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [words, setWords] = useState(text);
  const [file, setFile] = useState<File | null>(() => (shot ? kitShot() : null));
  const [details, setDetails] = useState(true);
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
      details={details}
      onDetails={setDetails}
      detailsLine={LINE}
      phase={phase}
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
      lead="One small form for a bug or an idea: the words, one screenshot (picked, pasted or dropped) and the app details. Offline, it saves and says so in a toast."
    >
      <Pair title="Send feedback, empty" render={() => <Form />} />
      <Pair title="Send feedback, with a screenshot" render={() => <Form text={WORDS} shot />} />
      <Pair title="Send feedback, sending" render={() => <Form text={WORDS} phase="sending" />} />
      <Pair title="Send feedback, sent" render={() => <Form text={WORDS} phase="sent" />} />
    </Section>
  );
}
