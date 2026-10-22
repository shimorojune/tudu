import { GETTING_STARTED_STEPS, GETTING_STARTED_WORDS, type GettingStartedStep } from '@tudu/core';
import { GettingStarted, type GettingStartedItem } from '@tudu/ui';
import { Pair, Section } from './Pair';

const items = (...done: GettingStartedStep[]): GettingStartedItem[] =>
  GETTING_STARTED_STEPS.map((k) => ({
    key: k,
    ...GETTING_STARTED_WORDS[k],
    done: done.includes(k),
    onDo: () => {},
  }));

/** Getting started in its four states from the board, light and dark. */
export function FirstRunStates() {
  return (
    <Section
      id="first-run"
      title="Getting started"
      lead="A small card in the corner of a new person’s first days. Each row ticks itself off as you do the thing; You’re set, then it eases away."
    >
      <Pair
        title="New"
        note="Nothing done yet: the ring is empty and every row is a way in."
        render={() => (
          <div className="kit-gs">
            <GettingStarted inline items={items()} />
          </div>
        )}
      />
      <Pair
        title="Two done"
        note="Done rows cross themselves off and stop being buttons; the ring fills by quarters."
        render={() => (
          <div className="kit-gs">
            <GettingStarted inline items={items('name', 'task')} />
          </div>
        )}
      />
      <Pair
        title="Folded"
        note="The title folds it to one line and back; phones start here."
        render={() => (
          <div className="kit-gs">
            <GettingStarted inline collapsed items={items('name', 'task')} />
          </div>
        )}
      />
      <Pair
        title="You’re set"
        note="All four done; 1.8s later it sinks and fades and never comes back."
        render={() => (
          <div className="kit-gs">
            <GettingStarted inline items={items('name', 'task', 'theme', 'jira')} />
          </div>
        )}
      />
    </Section>
  );
}
