import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Banner } from './Banner';
import { ConfirmDialog } from './ConfirmDialog';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../styles/components.css'), 'utf8').replace(/\s+/g, ' ');

describe('C22-U20 shared fixes made with the Notebook', () => {
  it('C22-U20 Banner buttons drop under the words below 520 px, indented to the text', () => {
    render(
      <Banner
        tone="warning"
        title="This note changed in another window."
        actions={[{ label: 'Show the newer one', primary: true }, { label: 'Keep mine' }]}
      >
        Your last edits are kept here until you choose.
      </Banner>,
    );
    // The banner measures its own width.
    expect(screen.getByRole('status').parentElement).toHaveClass('tp-banner-wrap');
    expect(css).toContain('.tp-banner-wrap { container-type: inline-size; }');
    expect(css).toMatch(/@container \(max-width: 520px\) \{ \.tp-banner \{ flex-wrap: wrap;/);
    expect(css).toContain('.tp-banner > svg + .tp-sp + button:not(.tp-x) { margin-left: 28px; }');
    expect(css).toMatch(/@container \(max-width: 270px\)/);
  });

  it('C22-U20 the comment box has equal side padding, and an empty state’s title wraps', () => {
    expect(css).toContain(
      '.tp-td-compose { flex: none; display: flex; align-items: flex-start; gap: 12px; padding: 12px 36px 14px;',
    );
    expect(css).toContain(
      '.tp-td.tp-compact .tp-td-compose { padding: 10px 20px max(12px, env(safe-area-inset-bottom, 0px)); }',
    );
    expect(css).toContain('.tp-empty-t, .tp-empty-b { text-wrap: balance;');
  });

  it('C22-U20 ConfirmDialog opens over the whole app, wherever it is asked from', () => {
    render(
      <div className="tp-drawer" data-testid="panel">
        <ConfirmDialog
          open
          title="Delete “Gift ideas”?"
          confirmLabel="Delete"
          onClose={() => {}}
          onConfirm={() => {}}
        />
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete “Gift ideas”?' });
    expect(screen.getByTestId('panel').contains(dialog)).toBe(false);
    expect(dialog.closest('.tp-dlg-layer')!.parentElement).toBe(document.body);
  });
});
