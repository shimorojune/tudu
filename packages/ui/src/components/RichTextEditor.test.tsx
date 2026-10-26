import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextContent, RichTextEditor, toHtml } from './RichTextEditor';
import { ToastHost } from './Toast';

describe('RichTextEditor', () => {
  it('C03-U10 notes: the toolbar rises on focus; bold, lists, checklist, link and code make the expected HTML; blur reports it once', async () => {
    const user = userEvent.setup();
    const onBlur = vi.fn();
    const { container } = render(
      <RichTextEditor variant="notes" label="Notes" placeholder="Add notes…" onBlur={onBlur} />,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    expect(area).toHaveAttribute('data-placeholder', 'Add notes…');
    const wrap = container.querySelector('.tp-rte')!;
    expect(wrap).toHaveClass('tp-rte-blank');
    expect(wrap).not.toHaveClass('tp-on');
    await user.click(area);
    expect(wrap).toHaveClass('tp-on');
    await user.keyboard('Meera wants a ');
    expect(wrap).not.toHaveClass('tp-rte-blank');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('yes or no');
    await user.click(screen.getByRole('button', { name: 'Bold' }));
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }));
    await user.keyboard('One');
    await user.click(screen.getByRole('button', { name: 'Checklist' }));
    await user.keyboard('{Enter}Pull the branch');
    expect(area.innerHTML).toContain('<p>Meera wants a <strong>yes or no</strong></p>');
    expect(area.querySelector('ul.tp-checks')).not.toBeNull();
    expect(area.innerHTML).toContain('Pull the branch');
    // a link on the selection
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Code' }));
    await user.keyboard('x');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const linkField = screen.getByRole('textbox', { name: 'Link address' });
    await user.type(linkField, 'x.y/spec{Enter}');
    expect(area.innerHTML).toContain('<code>x</code>');
    expect(area.innerHTML).toContain('href="https://x.y/spec"');
    // leaving the field reports the HTML (opening the link box may have reported it once already)
    await user.click(area);
    expect(area).toHaveFocus();
    const before = onBlur.mock.calls.length;
    act(() => {
      area.blur();
    });
    await waitFor(() => expect(onBlur.mock.calls.length).toBeGreaterThan(before));
    const last = onBlur.mock.calls.at(-1)!;
    expect(last[1]).toBe(false);
    const html = last[0] as string;
    expect(html).toContain('<strong>yes or no</strong>');
    expect(html).toContain(
      '<ul class="tp-checks" data-type="taskList"><li data-checked="false" data-type="taskItem">',
    );
    expect(html).not.toContain('Task item checkbox');
  });

  it('C03-U11 comment: the box grows, Comment is off while empty, submit clears it, Esc leaves the field', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { container } = render(
      <RichTextEditor
        variant="comment"
        label="Write a comment"
        placeholder="Write a comment…"
        onSubmit={onSubmit}
      />,
    );
    const wrap = container.querySelector('.tp-rte')!;
    expect(wrap).toHaveClass('tp-rte-comment');
    const area = screen.getByRole('textbox', { name: 'Write a comment' });
    await user.click(area);
    expect(wrap).toHaveClass('tp-on');
    const send = screen.getByRole('button', { name: 'Comment' });
    expect(send).toBeDisabled();
    await user.keyboard('Will review tomorrow.');
    expect(send).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Text style' })).toBeNull();
    await user.click(send);
    expect(onSubmit).toHaveBeenCalledWith('<p>Will review tomorrow.</p>');
    expect(wrap).toHaveClass('tp-rte-blank');
    await user.click(area);
    await user.keyboard('Again');
    expect(area.textContent).toBe('Again');
    fireEvent.keyDown(area, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1]![0]).toBe('<p>Again</p>');
    await user.keyboard('x{Escape}');
    expect(area).not.toHaveFocus();
  });

  it('C03-U12 RichTextContent renders stored HTML as prose, never scripts', () => {
    const { container } = render(
      <RichTextContent html='<p>Hi <b>there</b></p><script>alert(1)</script><ul class="tp-checks"><li data-checked="true">Done</li></ul><a href="javascript:x()" onclick="y()">bad</a>' />,
    );
    const el = container.querySelector('.tp-prose')!;
    expect(el.innerHTML).toBe(
      '<p>Hi <b>there</b></p><ul class="tp-checks"><li data-checked="true">Done</li></ul><a>bad</a>',
    );
    expect(toHtml('Two lines\n\nTwo paragraphs')).toBe('<p>Two lines</p><p>Two paragraphs</p>');
    expect(toHtml('<p>kept</p>')).toBe('<p>kept</p>');
  });
});

describe('attachments (chunk 04)', () => {
  it('C04-U13 Attach a file inserts the chip at the caret; the chip links to the file; stored HTML keeps the API path', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn(() => Promise.resolve({ id: 'abc-123', name: 'spec.pdf', size: 248_000 }));
    const onBlur = vi.fn();
    render(
      <RichTextEditor
        variant="notes"
        label="Notes"
        onAttach={onAttach}
        onBlur={onBlur}
        fileBase="https://api.test"
      />,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    await user.keyboard('Spec: ');
    await user.upload(screen.getByLabelText('Choose a file to attach'), new File(['x'], 'spec.pdf'));
    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(1));
    const chip = await waitFor(() => area.querySelector('a.tp-att')!);
    expect(chip).toHaveAttribute('href', 'https://api.test/api/files/abc-123');
    expect(chip).toHaveAttribute('data-id', 'abc-123');
    expect(chip.textContent).toBe('spec.pdf242 KB');
    act(() => area.blur());
    await waitFor(() => expect(onBlur).toHaveBeenCalled());
    const html = onBlur.mock.calls.at(-1)![0] as string;
    expect(html).toContain('href="/api/files/abc-123"');
    expect(html).not.toContain('https://api.test');
    // read-only, the chip links through the API's origin
    const { container } = render(<RichTextContent html={html} fileBase="https://api.test" />);
    expect(container.querySelector('a.tp-att')).toHaveAttribute('href', 'https://api.test/api/files/abc-123');
    // without onAttach the button stays out
    render(<RichTextEditor variant="notes" label="Plain" />);
    expect(screen.queryAllByRole('button', { name: 'Attach a file' })).toHaveLength(1);
  });

  it('C11-U03 a stored chip opens in the editor as a chip (its name and size), not a plain link', () => {
    const stored =
      '<p>Plan: <a class="tp-att" href="/api/files/f1" data-id="f1" data-name="Q3 plan.pdf" data-size="2048"><span class="tp-att-i"></span>Q3 plan.pdf<span class="tp-att-s">2 KB</span></a></p>';
    render(<RichTextEditor variant="notes" label="Notes" value={stored} fileBase="https://api.test" />);
    const chip = screen.getByRole('textbox', { name: 'Notes' }).querySelector('a.tp-att')!;
    expect(chip).toHaveAttribute('data-name', 'Q3 plan.pdf');
    expect(chip).toHaveAttribute('data-size', '2048');
    expect(chip).toHaveAttribute('href', 'https://api.test/api/files/f1');
    expect(chip.querySelector('.tp-att-s')!.textContent).toBe('2 KB');
  });
});

/** A paste or a drop with files, as the browser hands them over (no words with it). */
function withFiles(type: 'paste' | 'drop' | 'dragenter' | 'dragleave', files: File[], text = '') {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const data = {
    files,
    types: files.length ? ['Files'] : ['text/plain'],
    items: [],
    getData: (t: string) => (t === 'text/plain' ? text : ''),
  };
  Object.defineProperty(ev, 'clipboardData', { value: data });
  Object.defineProperty(ev, 'dataTransfer', { value: data });
  return ev;
}

/** An upload that finishes when the test says. */
function deferredUpload() {
  const calls: {
    file: File;
    progress?: (r: number) => void;
    ok: (v: unknown) => void;
    fail: (e: unknown) => void;
  }[] = [];
  const onAttach = vi.fn(
    (file: File, progress?: (r: number) => void) =>
      new Promise<{ id: string; name: string; size: number }>((ok, fail) => {
        calls.push({ file, progress, ok: ok as (v: unknown) => void, fail });
      }),
  );
  return { onAttach, calls };
}

describe('paste, drop and uploading chips', () => {
  it('C04-U20 the Attachment node writes the same chip as the server: stem, extension, size, title; an old chip redraws', async () => {
    const { chipHtml } = await import('@tudu/core');
    const old =
      '<p><a class="tp-att" href="/api/files/f1" data-id="f1" data-name="WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg" data-size="248000"><span class="tp-att-i"></span>WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg<span class="tp-att-s">242 KB</span></a></p>';
    const onBlur = vi.fn();
    render(<RichTextEditor variant="notes" label="Notes" value={old} onBlur={onBlur} />);
    const area = screen.getByRole('textbox', { name: 'Notes' });
    const chip = area.querySelector('a.tp-att')!;
    expect(chip.querySelector('.tp-att-stem')!.textContent).toBe('WhatsApp Image 2026-08-05 at 4.29.27 PM');
    expect(chip.querySelector('.tp-att-ext')!.textContent).toBe('.jpeg');
    expect(chip.querySelector('.tp-att-s')!.textContent).toBe('242 KB');
    expect(chip).toHaveAttribute('title', 'WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg');
    // what the editor stores reads as the server's chip once cleaned
    act(() => area.focus());
    act(() => area.blur());
    await waitFor(() => expect(onBlur).toHaveBeenCalled());
    const { cleanHtml } = await import('@tudu/core');
    const stored = cleanHtml(onBlur.mock.calls.at(-1)![0] as string);
    const server = cleanHtml(
      chipHtml({ id: 'f1', name: 'WhatsApp Image 2026-08-05 at 4.29.27 PM.jpeg', size: 248_000 }),
    );
    const inner = (h: string) => h.slice(h.indexOf('<span class="tp-att-i">'), h.lastIndexOf('</a>'));
    expect(inner(stored)).toBe(inner(server));
    // read-only (comments): an old chip is redrawn the same way
    const { container } = render(<RichTextContent html={old} />);
    expect(container.querySelector('.tp-att-ext')!.textContent).toBe('.jpeg');
    expect(container.querySelector('a.tp-att')).toHaveAttribute('title');
  });

  it('C04-U22 a pasted screenshot goes in at the caret as an uploading chip, fills, then lands; stored HTML never has the upload; text pastes are untouched', async () => {
    const { onAttach, calls } = deferredUpload();
    const onInput = vi.fn();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(
      <RichTextEditor variant="notes" label="Notes" onAttach={onAttach} onInput={onInput} onBlur={onBlur} />,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    await user.keyboard('Shot: ');
    const png = new File([new Uint8Array(1_260_000)], 'image.png', { type: 'image/png' });
    act(() => {
      area.dispatchEvent(withFiles('paste', [png]));
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(calls[0]!.file.name).toMatch(/^Pasted image \d{1,2} [A-Z][a-z]{2} \d{2}\.\d{2}\.png$/);
    const up = await waitFor(() => area.querySelector('[data-tp-upload]')!);
    expect(up).toHaveClass('tp-att', 'tp-att-up');
    expect(up.querySelector('.tp-att-ext')!.textContent).toBe('.png');
    expect(up.querySelector('.tp-att-s')!.textContent).toBe('0%');
    act(() => calls[0]!.progress!(0.4));
    await waitFor(() => expect(area.querySelector('[data-tp-upload] .tp-att-s')!.textContent).toBe('40%'));
    expect((area.querySelector('[data-tp-upload]') as HTMLElement).style.getPropertyValue('--tp-up')).toBe(
      '0.4',
    );
    expect(screen.getByRole('progressbar', { name: /^Attaching Pasted image/ })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    // while it uploads, what the editor hands on has the words and no upload
    const mid = onInput.mock.calls.at(-1)![0] as string;
    expect(mid).toContain('Shot:');
    expect(mid).not.toContain('data-tp-upload');
    await act(async () => calls[0]!.ok({ id: 'png-1', name: calls[0]!.file.name, size: png.size }));
    const chip = await waitFor(() => area.querySelector('a.tp-att')!);
    expect(area.querySelector('[data-tp-upload]')).toBeNull();
    expect(chip).toHaveAttribute('data-id', 'png-1');
    expect(chip.querySelector('.tp-att-s')!.textContent).toBe('1.2 MB');
    // a text paste is the editor's own
    act(() => {
      area.dispatchEvent(withFiles('paste', [], 'just words'));
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    act(() => area.blur());
    await waitFor(() => expect(onBlur).toHaveBeenCalled());
    const html = onBlur.mock.calls.at(-1)![0] as string;
    expect(html).toContain('data-id="png-1"');
    expect(html).not.toContain('data-tp-upload');
  });

  it('C04-U22 a file that lands after the field was left saves on its own', async () => {
    const { onAttach, calls } = deferredUpload();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(<RichTextEditor variant="notes" label="Notes" onAttach={onAttach} onBlur={onBlur} />);
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    act(() => {
      area.dispatchEvent(withFiles('paste', [new File(['x'], 'spec.pdf', { type: 'application/pdf' })]));
    });
    act(() => area.blur());
    await waitFor(() => expect(onBlur).toHaveBeenCalledTimes(1));
    expect(onBlur.mock.calls[0]![0]).not.toContain('tp-att');
    await act(async () => calls[0]!.ok({ id: 'spec-1', name: 'spec.pdf', size: 1 }));
    await waitFor(() => expect(onBlur).toHaveBeenCalledTimes(2));
    expect(onBlur.mock.calls[1]![0]).toContain('data-id="spec-1"');
  });

  it('C04-U23 a drop with files shows the outline and attaches; a drop without files does not', async () => {
    const { onAttach, calls } = deferredUpload();
    const { container } = render(<RichTextEditor variant="notes" label="Notes" onAttach={onAttach} />);
    const wrap = container.querySelector('.tp-rte')!;
    const area = screen.getByRole('textbox', { name: 'Notes' });
    const pdf = new File(['x'], 'offsite-agenda-v3.pdf', { type: 'application/pdf' });
    expect(screen.getByText('Drop to attach · it goes where the caret is')).toBeInTheDocument();
    act(() => {
      area.dispatchEvent(withFiles('dragenter', [pdf]));
    });
    expect(wrap).toHaveClass('tp-rte-dropping');
    act(() => {
      area.dispatchEvent(withFiles('dragleave', [pdf]));
    });
    expect(wrap).not.toHaveClass('tp-rte-dropping');
    act(() => {
      area.dispatchEvent(withFiles('dragenter', [pdf]));
    });
    act(() => {
      area.dispatchEvent(withFiles('drop', [pdf]));
    });
    expect(wrap).not.toHaveClass('tp-rte-dropping');
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect(calls[0]!.file.name).toBe('offsite-agenda-v3.pdf');
    await waitFor(() => expect(area.querySelector('[data-tp-upload]')).not.toBeNull());
    act(() => {
      area.dispatchEvent(withFiles('drop', [], 'words'));
    });
    expect(onAttach).toHaveBeenCalledTimes(1);
    // without onAttach there is no outline to show
    const plain = render(<RichTextEditor variant="notes" label="Plain" />);
    expect(plain.container.querySelector('.tp-rte-drop')).toBeNull();
  });

  it('C04-U24 a failed upload turns the chip red with Retry and ×, and says so; Retry sends the same file; × takes it out', async () => {
    const { onAttach, calls } = deferredUpload();
    const onBlur = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <RichTextEditor variant="notes" label="Notes" onAttach={onAttach} onBlur={onBlur} />
        <ToastHost />
      </>,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    const shot = new File(['x'], 'venue-map.png', { type: 'image/png' });
    act(() => {
      area.dispatchEvent(withFiles('paste', [shot, new File(['y'], 'second.pdf')]));
    });
    expect(onAttach).toHaveBeenCalledTimes(2);
    await act(async () => calls[0]!.fail(new TypeError('Failed to fetch')));
    const bad = await waitFor(() => area.querySelector('.tp-att-err')!);
    expect(bad.querySelector('.tp-att-stem')!.textContent).toBe('venue-map');
    expect(
      screen.getByText('Couldn’t attach the file. Check your connection and retry.'),
    ).toBeInTheDocument();
    expect(within(bad as HTMLElement).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    // nothing failed is ever handed on
    act(() => area.blur());
    await waitFor(() => expect(onBlur).toHaveBeenCalled());
    expect(onBlur.mock.calls.at(-1)![0]).not.toContain('venue-map');
    // Retry: the same file goes again and lands
    fireEvent.click(within(bad as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(onAttach).toHaveBeenCalledTimes(3);
    expect(calls[2]!.file).toBe(shot);
    await waitFor(() => expect(area.querySelector('.tp-att-err')).toBeNull());
    await act(async () => calls[2]!.ok({ id: 'map-1', name: 'venue-map.png', size: 1 }));
    await waitFor(() => expect(area.querySelector('a.tp-att[data-id="map-1"]')).not.toBeNull());
    // × takes a failed one out
    await act(async () => calls[1]!.fail(new Error('Network down')));
    const bad2 = await waitFor(() => area.querySelector('.tp-att-err')!);
    fireEvent.click(within(bad2 as HTMLElement).getByRole('button', { name: 'Remove second.pdf' }));
    await waitFor(() => expect(area.querySelector('[data-tp-upload]')).toBeNull());
    expect(area.querySelectorAll('a.tp-att')).toHaveLength(1);
  });

  it('C04-U24 a refusal from the server (too big there, not allowed) takes the chip out and shows the reason', async () => {
    const { onAttach, calls } = deferredUpload();
    const user = userEvent.setup();
    render(
      <>
        <RichTextEditor variant="notes" label="Notes" onAttach={onAttach} />
        <ToastHost />
      </>,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    act(() => {
      area.dispatchEvent(withFiles('paste', [new File(['x'], 'a.pdf')]));
    });
    await act(async () =>
      calls[0]!.fail(Object.assign(new Error('That file type isn’t allowed.'), { status: 415 })),
    );
    await waitFor(() => expect(area.querySelector('[data-tp-upload]')).toBeNull());
    expect(screen.getByText('That file type isn’t allowed.')).toBeInTheDocument();
  });

  it('C04-U25 a file over 25 MB and an offline editor make no chip and say why', async () => {
    const onAttach = vi.fn(() => Promise.resolve({ id: 'x', name: 'x', size: 1 }));
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <RichTextEditor variant="notes" label="Notes" onAttach={onAttach} />
        <ToastHost />
      </>,
    );
    const area = screen.getByRole('textbox', { name: 'Notes' });
    await user.click(area);
    const big = new File(['x'], 'film.mov');
    Object.defineProperty(big, 'size', { value: 30 * 1024 * 1024 });
    act(() => {
      area.dispatchEvent(withFiles('paste', [big]));
    });
    expect(onAttach).not.toHaveBeenCalled();
    expect(area.querySelector('[data-tp-upload]')).toBeNull();
    expect(screen.getByText('That file is too big. Files can be up to 25 MB.')).toBeInTheDocument();
    rerender(
      <>
        <RichTextEditor variant="notes" label="Notes" onAttach={onAttach} offline />
        <ToastHost />
      </>,
    );
    act(() => {
      area.dispatchEvent(withFiles('paste', [new File(['x'], 'small.pdf')]));
    });
    expect(onAttach).not.toHaveBeenCalled();
    expect(screen.getByText('You’re offline. Files need a connection.')).toBeInTheDocument();
  });

  it('C04-U26 Comment and Cmd+Enter wait while a file uploads or has failed, and post once it lands', async () => {
    const { onAttach, calls } = deferredUpload();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <RichTextEditor variant="comment" label="Write a comment" onAttach={onAttach} onSubmit={onSubmit} />,
    );
    const area = screen.getByRole('textbox', { name: 'Write a comment' });
    await user.click(area);
    await user.keyboard('Here is the map ');
    act(() => {
      area.dispatchEvent(withFiles('paste', [new File(['x'], 'venue-map.png', { type: 'image/png' })]));
    });
    const send = screen.getByRole('button', { name: 'Comment' });
    await waitFor(() => expect(send).toBeDisabled());
    fireEvent.keyDown(area, { key: 'Enter', metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => calls[0]!.fail(new TypeError('Failed to fetch')));
    await waitFor(() => expect(area.querySelector('.tp-att-err')).not.toBeNull());
    expect(send).toBeDisabled();
    fireEvent.click(within(area).getByRole('button', { name: 'Retry' }));
    await act(async () => calls[1]!.ok({ id: 'map-1', name: 'venue-map.png', size: 1 }));
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.keyDown(area, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toContain('data-id="map-1"');
  });
});

describe('C03-U29 the placeholder only on a truly blank editor', () => {
  it('C03-U29 an empty list, checklist, heading or quote is not blank; an empty line is', () => {
    for (const value of [
      '<ul><li><p></p></li></ul>',
      '<ul data-type="taskList" class="tp-checks"><li data-type="taskItem" data-checked="false"><p></p></li></ul>',
      '<h2></h2>',
      '<blockquote><p></p></blockquote>',
    ]) {
      const { container, unmount } = render(<RichTextEditor variant="notes" label="Notes" value={value} />);
      expect(container.querySelector('.tp-rte'), value).not.toHaveClass('tp-rte-blank');
      unmount();
    }
    for (const value of ['', '<p></p>']) {
      const { container, unmount } = render(<RichTextEditor variant="notes" label="Notes" value={value} />);
      expect(container.querySelector('.tp-rte')).toHaveClass('tp-rte-blank');
      unmount();
    }
  });

  it('C03-U29 starting a list in a blank note drops the placeholder, though it still reports empty', async () => {
    const user = userEvent.setup();
    const onInput = vi.fn();
    const { container } = render(
      <RichTextEditor variant="notes" label="Notes" placeholder="Write anything." onInput={onInput} />,
    );
    const wrap = container.querySelector('.tp-rte')!;
    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    expect(wrap).toHaveClass('tp-rte-blank');
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }));
    expect(wrap).not.toHaveClass('tp-rte-blank');
    expect(onInput.mock.calls.at(-1)![1]).toBe(true);
    // Back to one empty line: the placeholder returns.
    await user.click(screen.getByRole('button', { name: 'Bulleted list' }));
    expect(wrap).toHaveClass('tp-rte-blank');
  });

  it('C03-U29 typing "- " starts a list and drops the placeholder; so does a comment box', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <RichTextEditor variant="comment" label="Comment" placeholder="Add a comment" />,
    );
    await user.click(screen.getByRole('textbox', { name: 'Comment' }));
    await user.keyboard('- ');
    expect(container.querySelector('.tp-rte-area ul')).not.toBeNull();
    expect(container.querySelector('.tp-rte')).not.toHaveClass('tp-rte-blank');
  });
});
