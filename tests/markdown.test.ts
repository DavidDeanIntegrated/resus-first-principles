import { describe, expect, it } from 'vitest';
import { inlineMarkdownToHtml, markdownHrefs } from '../src/lib/markdown.ts';

describe('inline markdown', () => {
  it('escapes html and renders inline marks and anchors', () => {
    const html = inlineMarkdownToHtml(
      'A <b>tag</b>, `code`, **strong**, *em*, and [the cause](#cause-bleed).',
    );
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<a href="#cause-bleed">the cause</a>');
    expect(markdownHrefs('See [bleeding](#cause-bleed) and [source](https://example.com/a).')).toEqual([
      '#cause-bleed',
      'https://example.com/a',
    ]);
  });

  it('leaves unsafe links as text', () => {
    const html = inlineMarkdownToHtml('[nope](javascript:alert(1))');
    expect(html).not.toContain('href=');
    expect(html).toContain('[nope](javascript:alert(1))');
  });
});
