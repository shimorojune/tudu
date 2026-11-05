import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteDrawing } from './NoteDrawing';

const PICTURE = { light: 'https://api.test/api/files/l1', dark: 'https://api.test/api/files/k1', words: 3 };

describe('C22-U92 a drawing block in a note', () => {
  it('C22-U92 shows the light or the dark picture by theme', () => {
    const { rerender } = render(<NoteDrawing id="d1" picture={PICTURE} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PICTURE.light);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Drawing, 3 words');
    rerender(<NoteDrawing id="d1" picture={PICTURE} dark />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PICTURE.dark);
    expect(screen.getByRole('img')).not.toHaveClass('tp-nb-draw-flip');
    // No dark picture of its own: the light one stands in, flipped (#55).
    rerender(<NoteDrawing id="d1" picture={{ ...PICTURE, dark: null }} dark />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PICTURE.light);
    expect(screen.getByRole('img')).toHaveClass('tp-nb-draw-flip');
  });

  it('C22-U92 says Picture not ready, with its words, when it has none', () => {
    render(<NoteDrawing id="d1" picture={{ light: null, dark: null, words: 2 }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Picture not ready')).toBeInTheDocument();
    expect(screen.getByText(/2 words · It’s made the next time you open it\./)).toBeInTheDocument();
  });

  it('C22-U92 Edit, a click and Enter open it; ⋯ › Delete drawing deletes it', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<NoteDrawing id="d1" picture={PICTURE} onOpen={onOpen} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Open the drawing' }));
    screen.getByRole('button', { name: 'Open the drawing' }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Drawing options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete drawing' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('C22-U92 open full size, its block keeps its place but hides its picture', () => {
    const { container } = render(<NoteDrawing id="d1" picture={PICTURE} open />);
    expect(container.querySelector('.tp-nb-draw')).toHaveClass('tp-nb-draw-open');
  });
});

describe('C22-U101 dark mode without a dark picture (#55)', () => {
  it('C22-U101 the light picture shows flipped only in dark mode, and never when there is a dark one', () => {
    const light = { light: 'https://api.test/api/files/l9', dark: null, words: 0 };
    const { rerender } = render(<NoteDrawing id="d1" picture={light} dark />);
    expect(screen.getByRole('img')).toHaveAttribute('src', light.light);
    expect(screen.getByRole('img')).toHaveClass('tp-nb-draw-flip');
    rerender(<NoteDrawing id="d1" picture={light} />);
    expect(screen.getByRole('img')).not.toHaveClass('tp-nb-draw-flip');
    rerender(<NoteDrawing id="d1" picture={PICTURE} dark />);
    expect(screen.getByRole('img')).toHaveAttribute('src', PICTURE.dark);
    expect(screen.getByRole('img')).not.toHaveClass('tp-nb-draw-flip');
  });
});

describe('C22-U102 the other theme’s picture is loaded ahead', () => {
  afterEach(() => vi.unstubAllGlobals());

  function watchImages() {
    const srcs: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(v: string) {
          srcs.push(v);
        }
      },
    );
    return srcs;
  }

  it('C22-U102 light mode loads the dark picture ahead, once', () => {
    const srcs = watchImages();
    const pic = { light: 'https://api.test/api/files/l2', dark: 'https://api.test/api/files/k2', words: 0 };
    const { rerender } = render(<NoteDrawing id="d1" picture={pic} />);
    rerender(<NoteDrawing id="d1" picture={pic} selected />);
    expect(srcs).toEqual([pic.dark]);
  });

  it('C22-U102 nothing to load ahead when both themes show the same picture', () => {
    const srcs = watchImages();
    render(
      <NoteDrawing id="d1" picture={{ light: 'https://api.test/api/files/l3', dark: null, words: 0 }} dark />,
    );
    expect(srcs).toEqual([]);
  });
});
