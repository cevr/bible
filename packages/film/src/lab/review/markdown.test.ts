// The markdown the review page shows: escaped first, so a doc can put no
// HTML of its own in the page. The fences, quotes and numbered lists are the
// owner's own docs' (the sets' docs he reads: lab-timeline.md, rbf-concepts.md,
// brand.md, bible-cast.md), the long lines cut short.

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
        '<ul><li>one<ul><li>under one</li></ul></li><li>two</li></ul>' +
        '<table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table>',
    );
  });

  test('a soft-wrapped paragraph is one paragraph, and a wrapped bullet stays in its item', () => {
    expect(
      markdownHtml(
        [
          'A sentence wrapped at the',
          'source width, still one paragraph.',
          '',
          'A second paragraph.',
          '- one bullet whose words',
          '  wrap onto a second line',
          '- two',
          '  - under two, wrapped',
          '    onto its own next line',
          '',
          'After the list.',
        ].join('\n'),
      ),
    ).toBe(
      '<p>A sentence wrapped at the source width, still one paragraph.</p>' +
        '<p>A second paragraph.</p>' +
        '<ul><li>one bullet whose words wrap onto a second line</li><li>two' +
        '<ul><li>under two, wrapped onto its own next line</li></ul></li></ul>' +
        '<p>After the list.</p>',
    );
  });

  test('a heading, a list item or a table row ends a paragraph', () => {
    expect(markdownHtml(['words', '# Head', 'more', '- item', 'last', '| a |'].join('\n'))).toBe(
      '<p>words</p><h1>Head</h1><p>more</p><ul><li>item last</li></ul>' +
        '<table><tr><td>a</td></tr></table>',
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

  test('a fence is its lines as they are, nothing in it read as Markdown (lab-timeline.md)', () => {
    const shell = [
      'cd apps/animations',
      'bun cli.ts publish out/rbf-rive-2026-10-14 --production righteousness-by-faith   # lands in the version open now',
      'bun cli.ts publish out/oneline-2026-10-14 --production look --version 5           # made for an older version',
      'bun run production list',
      'bun run production decide righteousness-by-faith "9005 over 9006" --quote "ok 9005 over 9006 for sure" \\',
      '  --set rbf-rive-2026-10-14 --point render:cold --variant 9005',
      'bun run production note look "Explore the One Line concept" --quote "also lets try exploring the one line concept"',
      'bun run production ask righteousness-by-faith "Punchy subtitles or the clean master?" \\',
      '  --set rbf-rive-2026-10-14 --point render:subtitles',
      'bun run production forward look --after 5 --title "One Line" --because "9005 holds; try One Line"',
    ];
    expect(
      markdownHtml(
        [
          'over.**',
          '',
          '```sh',
          ...shell,
          '```',
          '',
          "`film publish` stamps the set's `review.json`",
        ].join('\n'),
      ),
    ).toBe(
      `<p>over.**</p><pre><code>${escapeHtml(shell.join('\n'))}</code></pre>` +
        '<p><code>film publish</code> stamps the set&#39;s <code>review.json</code></p>',
    );
    expect(
      markdownHtml(
        ['words', '```', '# no head', '- no item', '| no | row |', '**no bold**'].join('\n'),
      ),
    ).toBe('<p>words</p><pre><code># no head\n- no item\n| no | row |\n**no bold**</code></pre>');
    expect(markdownHtml(['~~~~', 'a ``` inside', '~~~~', 'after'].join('\n'))).toBe(
      '<pre><code>a ``` inside</code></pre><p>after</p>',
    );
    // One never closed runs to the doc's end.
    expect(markdownHtml(['```', 'open', '', 'still code'].join('\n'))).toBe(
      '<pre><code>open\n\nstill code</code></pre>',
    );
  });

  test('lines indented four after a rest are code; under a paragraph or an item they go on in it', () => {
    expect(
      markdownHtml(
        ['Paragraph.', '', '    const a = 1;', '', '\tconst b = 2;', '', 'After.'].join('\n'),
      ),
    ).toBe('<p>Paragraph.</p><pre><code>const a = 1;\n\nconst b = 2;</code></pre><p>After.</p>');
    expect(markdownHtml(['words', '    more'].join('\n'))).toBe('<p>words more</p>');
    expect(markdownHtml(['- item', '', '    more'].join('\n'))).toBe(
      '<ul><li>item</li></ul><p>more</p>',
    );
  });

  test('a quote is one blockquote, its markers gone, a lone > a paragraph break in it (rbf-concepts.md)', () => {
    expect(
      markdownHtml(
        [
          '**The setting (both frames):**',
          '',
          '> THE SCENE (the same in every style): one key frame from the cold open.',
          '>',
          '> Back plane: the far wall, tall sheets of pale toned parchment paper.',
          '>',
          '> Only these two figures are in the court: the judge and the accused. Nobody else.',
          '',
          '**The court frame, at "righteous":**',
        ].join('\n'),
      ),
    ).toBe(
      '<p><b>The setting (both frames):</b></p><blockquote>' +
        '<p>THE SCENE (the same in every style): one key frame from the cold open.</p>' +
        '<p>Back plane: the far wall, tall sheets of pale toned parchment paper.</p>' +
        '<p>Only these two figures are in the court: the judge and the accused. Nobody else.</p>' +
        '</blockquote><p><b>The court frame, at &quot;righteous&quot;:</b></p>',
    );
  });

  test('a quote wrapped over its lines is one paragraph, and no > lands in a line (brand.md)', () => {
    expect(
      markdownHtml(
        [
          '## 1 · Cool of the Day',
          '',
          '> "And they heard the voice of the LORD God walking in the garden in the cool',
          '> of the day." Genesis 3:8',
          '',
          '**The idea.** The evening hour in Eden',
        ].join('\n'),
      ),
    ).toBe(
      '<h2>1 · Cool of the Day</h2><blockquote><p>&quot;And they heard the voice of the LORD God ' +
        'walking in the garden in the cool of the day.&quot; Genesis 3:8</p></blockquote>' +
        '<p><b>The idea.</b> The evening hour in Eden</p>',
    );
    // A quote right under a paragraph ends it; a line right under a quote goes on in it.
    expect(markdownHtml(['words before', '> quoted', 'lazily on', '- after'].join('\n'))).toBe(
      '<p>words before</p><blockquote><p>quoted lazily on</p></blockquote><ul><li>after</li></ul>',
    );
  });

  test("numbered items are an ol, and a list under an item is inside the item's li (bible-cast.md)", () => {
    expect(
      markdownHtml(
        [
          '**What to look at, in order:**',
          "1. **bible-christ.png**: Christ's two dresses.",
          '   - On the left, the earthly coat and mantle, four times.',
          "   - On the right, the Priest and Advocate's robe.",
          "2. **bible-heaven.png**: heaven's figures, left to right:",
          '   - the accuser, turned and front on;',
          "3. **bible-eden.png**: Adam and Eve in Eden's three garment states.",
        ].join('\n'),
      ),
    ).toBe(
      '<p><b>What to look at, in order:</b></p><ol>' +
        '<li><b>bible-christ.png</b>: Christ&#39;s two dresses.<ul>' +
        '<li>On the left, the earthly coat and mantle, four times.</li>' +
        '<li>On the right, the Priest and Advocate&#39;s robe.</li></ul></li>' +
        '<li><b>bible-heaven.png</b>: heaven&#39;s figures, left to right:<ul>' +
        '<li>the accuser, turned and front on;</li></ul></li>' +
        '<li><b>bible-eden.png</b>: Adam and Eve in Eden&#39;s three garment states.</li></ol>',
    );
    expect(markdownHtml(['3. three', '4. four'].join('\n'))).toBe(
      '<ol start="3"><li>three</li><li>four</li></ol>',
    );
    expect(markdownHtml(['- a', '1. b'].join('\n'))).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
  });
});
