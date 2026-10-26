import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../lib/icons';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { IconButton } from './IconButton';

const rules = parseRules(readStylesheet('components.css'));

describe('IconButton', () => {
  it('C00-U09 takes its accessible name from the required label', () => {
    render(
      <IconButton label="Close">
        <Icon name="x" />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn).toHaveAttribute('aria-label', 'Close');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveClass('tp-ib');
    expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('C00-U09 the label cannot be left out', () => {
    // Checked by `pnpm typecheck`; never rendered.
    function _withoutLabel() {
      // @ts-expect-error label is the accessible name and the tooltip; it is required
      return <IconButton>x</IconButton>;
    }
    expect(typeof _withoutLabel).toBe('function');
    render(
      <IconButton label="Menu" tip={false}>
        <Icon name="more" />
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  // jsdom has no :active styling, so the press wash is read from the stylesheet.
  it('C00-U09 shows the press wash: an accent fill on press, quickly, and nothing moves', () => {
    const press = rulesWhere(rules, (s) => s === '.tp-ib:active');
    expect(press.some((r) => r.declarations.background === 'var(--accent)')).toBe(true);
    expect(press.some((r) => r.declarations['transition-duration'] === '70ms')).toBe(true);
    for (const r of press) {
      expect(r.declarations, r.selector).not.toHaveProperty('transform');
      expect(r.declarations, r.selector).not.toHaveProperty('font-weight');
    }
    const base = rulesWhere(rules, (s) => s === '.tp-ib')[0];
    expect(base?.declarations.transition).toContain('background-color var(--dur-menu)');
  });

  it('C20-U09 tipLabel says more in the tooltip while the label stays the accessible name', async () => {
    render(
      <IconButton label="New task" tipLabel="New task  ⌘⇧N">
        <Icon name="plus" />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'New task' });
    act(() => btn.focus());
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('New task ⌘⇧N'));
    expect(btn).toHaveAttribute('aria-label', 'New task');
  });
});
