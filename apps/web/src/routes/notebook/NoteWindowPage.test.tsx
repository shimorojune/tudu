import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resetThemeForTests } from '@tudu/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDesktop, type DesktopFake } from '../../app/desktop';
import type { NoteWindowViewProps } from '../../app/NoteWindowView';
import { NoteWindowPage } from './NoteWindowPage';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../../app/live', () => ({ useLiveEvents: () => {} }));
vi.mock('../../app/workingDay', () => ({
  WorkingDayProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('../../app/notebook', () => ({ showInWindow: vi.fn(), leaveWindow: vi.fn() }));
// The window's own chrome, without the notes behind it.
vi.mock('../../app/NoteWindowView', async () => {
  const { NoteWindow } = await import('@tudu/ui');
  return {
    NoteWindowView: (p: NoteWindowViewProps) => (
      <NoteWindow {...p} active="new" onOpenApp={p.onOpenApp ? () => p.onOpenApp!(null) : undefined} />
    ),
  };
});

let fake: DesktopFake;
const emit = (event: string, payload?: unknown) =>
  act(() => {
    for (const fn of fake.listeners?.[event] ?? []) fn(payload);
  });

afterEach(cleanup);
beforeEach(() => {
  fake = { window: 'note', calls: [] };
  window.__tuduDesktopFake = fake;
  resetDesktop();
  localStorage.clear();
  resetThemeForTests();
  document.documentElement.classList.remove('dark');
  navigate.mockReset();
});

describe('C22-U64 the Mac note window follows the theme', () => {
  it('C22-U64 a pick stored by the desk (the storage event) paints it; one made while hidden is painted on open', async () => {
    render(<NoteWindowPage />);
    await waitFor(() => expect(fake.listeners?.['note:open']?.length).toBe(1));
    expect(document.documentElement).not.toHaveClass('dark');
    localStorage.setItem('tudu.theme', 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tudu.theme', newValue: 'dark' }));
    });
    expect(document.documentElement).toHaveClass('dark');
    // Picked on the desk while the window was hidden, the event missed.
    localStorage.setItem('tudu.theme', 'light');
    emit('note:open', { pinned: false, expanded: false, ask: { id: null, linkTo: null, nonce: 1 } });
    expect(document.documentElement).not.toHaveClass('dark');
  });
});

describe('C22-U65 pinned, closed and opened again', () => {
  it('C22-U65 note:open with pinned false shows the plain pin, not pressed', async () => {
    fake.note = { pinned: true };
    render(<NoteWindowPage />);
    await screen.findByRole('button', { name: 'Pinned on top · click to unpin' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(fake.calls.map((c) => c.name)).toContain('hideNote');
    emit('note:open', { pinned: false, expanded: false, ask: { id: null, linkTo: null, nonce: 2 } });
    expect(screen.getByRole('button', { name: 'Keep on top of other windows' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('C22-U66 the note window page in a browser', () => {
  it('C22-U66 /note-window/abc goes on to the note on the Notebook page', () => {
    delete window.__tuduDesktopFake;
    resetDesktop();
    render(<NoteWindowPage noteId="abc" />);
    expect(navigate).toHaveBeenCalledWith({ href: '/notebook/abc', replace: true });
  });
});

describe('C22-U70 resizing the Mac note window from an edge', () => {
  it('C22-U70 the app takes the frame on pointer down, then how far the pointer moved on the screen', async () => {
    const { container } = render(<NoteWindowPage />);
    await waitFor(() => expect(container.querySelector('[data-edge="nw"]')).not.toBeNull());
    const h = container.querySelector('[data-edge="nw"]')!;
    // jsdom has no PointerEvent: mouse events of the pointer's types carry the screen position.
    const ptr = (type: string, el: EventTarget, screenX: number, screenY: number) =>
      act(() => {
        el.dispatchEvent(
          new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, screenX, screenY }),
        );
      });
    ptr('pointerdown', h, 500, 400);
    ptr('pointerup', document, 470, 380);
    const resize = fake.calls.filter((c) => c.name === 'beginResize' || c.name === 'resizeTo');
    expect(resize).toEqual([
      { name: 'beginResize', args: [] },
      { name: 'resizeTo', args: ['nw', -30, -20] },
    ]);
  });
});
