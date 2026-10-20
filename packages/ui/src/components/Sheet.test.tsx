import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseRules, readStylesheet, rulesWhere } from '../test-utils/stylesheet';
import { DayTitle, Sheet, SheetBody } from './Sheet';

const rules = parseRules(readStylesheet('components.css'));

describe('Sheet', () => {
  it('C00-U33 only the sheet body scrolls; it marks itself once scrolled', () => {
    render(
      <Sheet fill label="Sunday" minHeight={560}>
        <div data-testid="header">
          <DayTitle day="Sunday" date="18 October" eyebrow="Today" />
        </div>
        <SheetBody data-testid="body">list</SheetBody>
      </Sheet>,
    );
    const sheet = screen.getByRole('region', { name: 'Sunday' });
    const header = screen.getByTestId('header');
    const body = screen.getByTestId('body');
    expect(sheet.tagName).toBe('SECTION');
    expect(sheet).toHaveClass('tp-sheet', 'tp-sheet-fill');
    expect(sheet).toHaveStyle({ minHeight: '560px' });
    expect(sheet).toContainElement(header);
    expect(sheet).toContainElement(body);
    expect(body).not.toContainElement(header);
    expect(body).toHaveClass('tp-sheet-body');
    expect(body).not.toHaveAttribute('data-scrolled');

    fireEvent.scroll(body, { target: { scrollTop: 10 } });
    expect(body).toHaveAttribute('data-scrolled', 'true');
    expect(body).toHaveClass('tp-scrolled');

    fireEvent.scroll(body, { target: { scrollTop: 1 } }); // within the 2px of slack
    expect(body).not.toHaveAttribute('data-scrolled');
    expect(body).not.toHaveClass('tp-scrolled');

    fireEvent.scroll(body, { target: { scrollTop: 3 } });
    expect(body).toHaveAttribute('data-scrolled', 'true');
    fireEvent.scroll(body, { target: { scrollTop: 0 } });
    expect(body).not.toHaveAttribute('data-scrolled');
  });

  // jsdom has no layout: which part scrolls is read from the stylesheet.
  it('C00-U33 the stylesheet lets the body scroll and keeps the header put', () => {
    const fill = rulesWhere(rules, (s) => s === '.tp-sheet-fill')[0];
    expect(fill?.declarations).toMatchObject({ display: 'flex', 'flex-direction': 'column', 'max-height': '100%' });
    const bodyRule = rulesWhere(rules, (s) => s === '.tp-sheet-body')[0];
    expect(bodyRule?.declarations).toMatchObject({ 'overflow-y': 'auto', flex: '1 1 auto', 'min-height': '0' });
    // the day header does not shrink or scroll
    expect(rulesWhere(rules, (s) => s === '.tp-sheet-fill .tp-dh')[0]?.declarations.flex).toBe('none');
    // the sheet itself never scrolls
    for (const r of rulesWhere(rules, (s) => s === '.tp-sheet' || s === '.tp-sheet-fill')) {
      expect(r.declarations['overflow-y'], r.selector).toBeUndefined();
      expect(r.declarations.overflow, r.selector).toBeUndefined();
    }
    // once scrolled, the body's top edge fades under the header's hairline
    const scrolled = rulesWhere(rules, (s) => s === '.tp-sheet-body.tp-scrolled')[0];
    expect(scrolled?.declarations['mask-image']).toContain('linear-gradient(to bottom, transparent 0');
  });

  it('C00-U33 a sheet without fill is plain content, and `as` picks the element', () => {
    render(
      <Sheet as="main" label="Day">
        <p>content</p>
      </Sheet>,
    );
    const main = screen.getByRole('main', { name: 'Day' });
    expect(main).toHaveClass('tp-root', 'tp-sheet');
    expect(main).not.toHaveClass('tp-sheet-fill');
    expect(main.querySelector('.tp-sheet-body')).toBeNull();
  });
});
