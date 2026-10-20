import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
});
