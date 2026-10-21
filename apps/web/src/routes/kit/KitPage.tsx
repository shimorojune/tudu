import { Logo } from '@tudu/ui';
import { Controls } from './Controls';
import { Foundations, ThemeBlock } from './Foundations';
import { Detail } from './Detail';
import { Overlays } from './Overlays';
import { QuickAddStates } from './QuickAddStates';
import { WeekStates } from './WeekStates';
import './kit.css';

const NAV = [
  ['theme', 'Theme'],
  ['type', 'Type'],
  ['colour', 'Colour'],
  ['shape', 'Shape'],
  ['motion', 'Motion'],
  ['logo', 'Logo'],
  ['controls', 'Controls'],
  ['feedback', 'Feedback'],
  ['layers', 'Layers'],
  ['detail', 'Task detail'],
  ['quick-add', 'Quick Add'],
  ['week', 'The week'],
];

/** Every primitive in every state, light and dark side by side. The place to judge the motion. */
export function KitPage() {
  return (
    <div className="scroll-page tp-root kit" data-testid="kit">
      <header className="kit-top">
        <Logo size={22} wordmark />
        <nav aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
        <span className="kit-spacer" />
        <span className="kit-label">Kit · chunks 00 to 05</span>
      </header>
      <main className="kit-main">
        <h1 className="kit-h1">The kit</h1>
        <p className="kit-intro">
          Tudu Paper in code: tokens, type and every component in light and dark. Press the controls to see
          their motion.
        </p>
        <ThemeBlock />
        <Foundations />
        <Controls />
        <Overlays />
        <Detail />
        <QuickAddStates />
        <WeekStates />
      </main>
    </div>
  );
}
