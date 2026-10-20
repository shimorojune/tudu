import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { nightWords } from '@tudu/core';
import { Banner } from './Banner';

describe('Banner', () => {
  it('C00-U25 puts the tone icon first, the title in bold, and grows into place', () => {
    const { container } = render(
      <Banner title="Jira is not connected.">Reconnect to see its issues.</Banner>,
    );
    const wrap = container.querySelector('.tp-banner-wrap');
    expect(wrap).not.toBeNull();
    const banner = within(wrap as HTMLElement).getByRole('status');
    expect(banner).toHaveClass('tp-banner', 'tp-banner-warning');
    expect(banner).toHaveAttribute('data-tone', 'warning');

    expect(banner.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(banner.querySelector('b')).toHaveTextContent('Jira is not connected.');
    expect(banner).toHaveTextContent('Jira is not connected. Reconnect to see its issues.');
  });

  it('C00-U25 error is an alert; the other tones are status, each with its own icon', () => {
    const { rerender, container } = render(<Banner tone="error" title="This day did not load." />);
    expect(screen.getByRole('alert')).toHaveAttribute('data-tone', 'error');
    const iconClass = () => container.querySelector('svg')?.getAttribute('class');
    const errorIcon = iconClass();

    for (const tone of ['warning', 'success', 'info'] as const) {
      rerender(<Banner tone={tone} title="A note." />);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('status')).toHaveAttribute('data-tone', tone);
      expect(iconClass()).not.toBe(errorIcon);
    }
  });

  it('C00-U25 a single action is a button that calls onAction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Banner title="Jira is not connected." action="Reconnect" onAction={onAction}>
        Reconnect to see its issues.
      </Banner>,
    );
    const button = screen.getByRole('button', { name: 'Reconnect' });
    expect(button).not.toHaveClass('tp-solid');
    await user.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('C00-U25 two actions render as buttons; the primary one is solid', async () => {
    const user = userEvent.setup();
    const start = vi.fn();
    const stay = vi.fn();
    render(
      <Banner
        tone="info"
        title="It's 00:40 on Monday."
        actions={[
          { label: 'Start Monday', onClick: start, primary: true },
          { label: 'Stay on Sunday', onClick: stay },
        ]}
      >
        You're still on Sunday's list.
      </Banner>,
    );
    expect(screen.getByRole('button', { name: 'Start Monday' })).toHaveClass('tp-solid');
    expect(screen.getByRole('button', { name: 'Stay on Sunday' })).not.toHaveClass('tp-solid');

    await user.click(screen.getByRole('button', { name: 'Stay on Sunday' }));
    expect(stay).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('C00-U25 onDismiss adds a Dismiss button that calls it', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { rerender } = render(<Banner title="Saved." tone="success" />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();

    rerender(<Banner title="Saved." tone="success" onDismiss={onDismiss} />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveClass('tp-x');
    await user.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('C02-U18 the after-midnight banner offers Start Monday (primary) and Stay on Sunday', async () => {
    const user = userEvent.setup();
    const start = vi.fn();
    const stay = vi.fn();
    const w = nightWords(new Date(2026, 9, 19, 0, 40), '2026-10-18', '2026-10-19');
    render(
      <Banner
        tone="info"
        title={w.title}
        actions={[
          { label: w.start, primary: true, onClick: start },
          { label: w.stay, onClick: stay },
        ]}
        onDismiss={stay}
      >
        {w.body}
      </Banner>,
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveClass('tp-banner-info');
    expect(banner).toHaveTextContent(
      'It’s 00:40 on Monday. You’re still on Sunday’s list. Nothing has moved.',
    );
    const primary = screen.getByRole('button', { name: 'Start Monday' });
    expect(primary).toHaveClass('tp-solid');
    expect(screen.getByRole('button', { name: 'Stay on Sunday' })).not.toHaveClass('tp-solid');
    await user.click(primary);
    expect(start).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Stay on Sunday' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(stay).toHaveBeenCalledTimes(2);
  });
});
