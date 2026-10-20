import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RichTextContent, RichTextEditor, toHtml } from './RichTextEditor';

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
