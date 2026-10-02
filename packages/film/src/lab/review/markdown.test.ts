// The markdown the review page shows: escaped first, so a doc can put no
// HTML of its own in the page.

import { describe, expect, test } from 'bun:test';
import { escapeHtml, markdownHtml } from './markdown.ts';

describe('markdown', () => {
  test('headings, paragraphs, nested lists, tables and inline marks', () => {
    expect(
      markdownHtml(
        [
          '# Title',
          'A **bold** and *quiet* line with `code`.',
          '- one',
          '  - under one',
          '- two',
          '| a | b |',
          '|---|---|',
          '| 1 | 2 |',
        ].join('\n'),
      ),
    ).toBe(
      '<h1>Title</h1><p>A <b>bold</b> and <i>quiet</i> line with <code>code</code>.</p>' +
        '<ul><li>one</li><ul><li>under one</li></ul><li>two</li></ul>' +
        '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
  });

  test('escapes every character a doc could use to put its own HTML in the page', () => {
    expect(markdownHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(markdownHtml('- <img src=x onerror="go()">')).toBe(
      '<ul><li>&lt;img src=x onerror=&quot;go()&quot;&gt;</li></ul>',
    );
    expect(escapeHtml(`a&'b`)).toBe('a&amp;&#39;b');
  });
});
