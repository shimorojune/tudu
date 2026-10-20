import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('Tag', () => {
  it('C00-U31 renders its children with a tone', () => {
    const { rerender } = render(<Tag tone="jira">TUDU-12</Tag>);
    const tag = screen.getByText('TUDU-12');
    expect(tag.tagName).toBe('SPAN');
    expect(tag).toHaveClass('tp-root', 'tp-tag', 'tp-tag-jira');
    expect(tag).toHaveAttribute('data-tone', 'jira');

    rerender(<Tag tone="team">Design</Tag>);
    expect(tag).toHaveClass('tp-tag-team');
    expect(tag).not.toHaveClass('tp-tag-jira');
    expect(tag).toHaveTextContent('Design');

    rerender(<Tag tone="project">Northwind</Tag>);
    expect(tag).toHaveClass('tp-tag-project');

    // neutral is the default and adds no tone class
    rerender(<Tag className="extra">18 Oct</Tag>);
    expect(tag).toHaveAttribute('data-tone', 'neutral');
    expect(tag.className).toBe('tp-root tp-tag extra');
  });
});
