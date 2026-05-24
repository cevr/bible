import { renderToString } from 'solid-js/web';
import { describe, expect, it } from 'vitest';
import { ParagraphView } from '../src/components/paragraph-view.jsx';
import { type Node } from '@bible/core/egw';

const render = (nodes: readonly Node[]): string =>
  renderToString(() => <ParagraphView nodes={nodes} />);

describe('ParagraphView', () => {
  it('renders Text as raw text', () => {
    const html = render([{ _tag: 'Text', text: 'Hello world' }]);
    expect(html).toContain('Hello world');
  });

  it('renders LineBreak as <br>', () => {
    const html = render([
      { _tag: 'Text', text: 'a' },
      { _tag: 'LineBreak' },
      { _tag: 'Text', text: 'b' },
    ]);
    expect(html).toMatch(/a.*<br[^>]*\/?>.*b/s);
  });

  it('renders PageBreak as a muted superscript with page number and a11y label', () => {
    const html = render([{ _tag: 'PageBreak', page: 54 }]);
    expect(html).toMatch(/<sup[^>]*class="page-break[^"]*"/);
    expect(html).toContain('aria-label="page 54"');
    expect(html).toContain('[');
    expect(html).toContain('54');
    expect(html).toContain(']');
  });

  it('renders Emphasis as <em> with nested children', () => {
    const html = render([{ _tag: 'Emphasis', children: [{ _tag: 'Text', text: 'italic' }] }]);
    expect(html).toMatch(/<em[^>]*>.*italic.*<\/em>/s);
  });

  it('renders Comment as non-egw-comment span wrapping children', () => {
    const html = render([
      {
        _tag: 'Comment',
        children: [
          { _tag: 'Text', text: 'editor note' },
          {
            _tag: 'ScriptureRef',
            title: 'Gen 3:1',
            dataLink: '1965.119',
            children: [{ _tag: 'Text', text: 'Genesis 3' }],
          },
        ],
      },
    ]);
    expect(html).toContain('class="non-egw-comment"');
    expect(html).toContain('editor note');
    expect(html).toContain('Genesis 3');
  });

  it('renders ScriptureRef as anchor carrying title and data-link', () => {
    const html = render([
      {
        _tag: 'ScriptureRef',
        title: 'Genesis 3:1',
        dataLink: '1965.119',
        children: [{ _tag: 'Text', text: 'Genesis 3' }],
      },
    ]);
    expect(html).toContain('data-link-kind="scripture"');
    expect(html).toContain('title="Genesis 3:1"');
    expect(html).toContain('data-link="1965.119"');
    expect(html).toContain('Genesis 3');
  });

  it('renders BookRef as anchor distinguishable via data-link-kind', () => {
    const html = render([
      {
        _tag: 'BookRef',
        title: 'GC 679',
        dataLink: '132.3067',
        children: [{ _tag: 'Text', text: 'Appendix' }],
      },
    ]);
    expect(html).toContain('data-link-kind="book"');
    expect(html).toContain('data-link="132.3067"');
    expect(html).toContain('Appendix');
  });

  it('renders Unknown nodes with their children visible (no text loss)', () => {
    const html = render([
      {
        _tag: 'Unknown',
        tag: 'span',
        className: 'mystery',
        children: [{ _tag: 'Text', text: 'preserved text' }],
      },
    ]);
    expect(html).toContain('class="ast-unknown"');
    expect(html).toContain('data-tag="span"');
    expect(html).toContain('data-class="mystery"');
    expect(html).toContain('preserved text');
  });
});
