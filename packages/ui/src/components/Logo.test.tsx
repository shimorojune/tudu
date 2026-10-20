import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseRules, readStylesheet, variablesOf } from '../test-utils/stylesheet';
import { Logo } from './Logo';

describe('Logo', () => {
  it('C00-U31 renders the mark at its size, named for screen readers', () => {
    const { rerender } = render(<Logo />);
    const mark = screen.getByRole('img', { name: 'Tudu' });
    expect(mark.tagName).toBe('svg');
    expect(mark).toHaveAttribute('height', '24');
    expect(Number(mark.getAttribute('width'))).toBeCloseTo((24 * 101) / 99.5, 5);
    expect(mark.closest('.tp-logo')).not.toBeNull();

    rerender(<Logo size={32} className="x" />);
    expect(mark).toHaveAttribute('height', '32');
    expect(mark.closest('.tp-logo')).toHaveClass('x');
  });

  it('C00-U31 with the wordmark the pair is one image and the word is set beside the mark', () => {
    render(<Logo wordmark size={20} />);
    const logo = screen.getByRole('img', { name: 'Tudu' });
    expect(logo.tagName).toBe('SPAN');
    expect(logo).toHaveClass('tp-logo');
    const svg = logo.querySelector('svg') as SVGElement;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    const word = logo.querySelector('.tp-logo-word') as HTMLElement;
    expect(word).toHaveTextContent('Tudu');
    expect(word).toHaveAttribute('aria-hidden', 'true');
    expect(word.style.fontSize).toBe(`${Math.round(20 * 0.78)}px`);
    expect(logo.style.gap).toBe(`${Math.round(20 * 0.32)}px`);
  });

  it('C00-U31 switches with the theme: every colour is a theme variable that light and dark define differently', () => {
    render(<Logo />);
    const svg = screen.getByRole('img', { name: 'Tudu' });
    const [ember, paper] = Array.from(svg.querySelectorAll('rect'));
    const tick = svg.querySelector('path');
    expect(ember).toHaveAttribute('fill', 'var(--brand)');
    expect(paper).toHaveAttribute('fill', 'var(--card)');
    expect(paper).toHaveAttribute('stroke', 'var(--check-border)');
    expect(tick).toHaveAttribute('fill', 'var(--foreground)');

    // jsdom has no CSS, so the switch is checked against the theme itself: each variable has a light value in
    // :root and a different dark value in .dark, which is what repaints the logo when the `dark` class changes.
    const theme = parseRules(readStylesheet('paper-theme.css'));
    const light = variablesOf(theme, ':root');
    const dark = variablesOf(theme, '.dark');
    for (const name of ['brand', 'card', 'check-border', 'foreground']) {
      expect(light[name], `--${name} light`).toBeTruthy();
      expect(dark[name], `--${name} dark`).toBeTruthy();
      expect(light[name], `--${name} differs`).not.toBe(dark[name]);
    }
  });
});
