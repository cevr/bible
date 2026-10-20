/**
 * The list and the hymn page, rendered to HTML as the web build renders
 * them, over the real compiled hymnal (`src/test/setup.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { renderToStaticMarkup } from 'react-dom/server';

import { hymnAt, hymns } from '~/hymns/hymns';

import { HymnList } from './HymnList';
import { HymnPage } from './HymnPage';

/** The page's text, tags dropped, one space between pieces. */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Each section's accessible name, in page order. */
const sectionsOf = (html: string) =>
  [...html.matchAll(/<div [^>]*role="group"[^>]*>/g)].map(
    ([tag]) => /aria-label="([^"]+)"/.exec(tag)?.[1],
  );

const page = (n: number) =>
  renderToStaticMarkup(<HymnPage hymn={Option.getOrThrow(hymnAt(String(n)))} />);

describe('the hymn list', () => {
  it('holds every hymn of the 1985 hymnal, 1 to 695 in order', () => {
    expect(hymns).toHaveLength(695);
    expect(hymns.map((h) => h.number)).toEqual(Array.from({ length: 695 }, (_, k) => k + 1));
  });

  it('shows each row as its number and title, linking to the hymn', () => {
    const html = renderToStaticMarkup(<HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} />);
    expect(html).toContain('href="/hymns/1"');
    expect(html).toContain('aria-label="1, Praise to the Lord"');
    expect(textOf(html)).toContain('1 Praise to the Lord 2 All Creatures of Our God and King');
  });

  it('says so when it has no hymn to show', () => {
    const html = renderToStaticMarkup(
      <HymnList hymns={[]} hrefOf={(n) => `/hymns/${n}`} empty="No hymn matches “zzq”." />,
    );
    expect(textOf(html)).toBe('No hymn matches “zzq”.');
  });
});

describe('a hymn page', () => {
  it('shows hymn 1 as its title, then its three stanzas in order', () => {
    const html = page(1);
    expect(sectionsOf(html)).toEqual(['Stanza 1', 'Stanza 2', 'Stanza 3']);
    const text = textOf(html);
    // Each stanza's first and last line, as the 1985 hymnal prints them.
    const expected = [
      '1 Praise to the Lord',
      '1 Praise to the Lord, the Almighty, the King of creation!',
      'Join ye in glad adoration!',
      "2 Praise to the Lord, who o'er all things so wondrously reigneth,",
      'Granted in what He ordaineth?',
      '3 Praise to the Lord, who doth prosper thy work and defend thee;',
      'If with His love He befriend thee.',
    ];
    let from = 0;
    for (const piece of expected) {
      const at = text.indexOf(piece, from);
      expect({ piece, found: at >= from }).toEqual({ piece, found: true });
      from = at + piece.length;
    }
  });

  it('writes the refrain out after each stanza where it is sung after each (100)', () => {
    const html = page(100);
    expect(sectionsOf(html)).toEqual([
      'Stanza 1',
      'Refrain',
      'Stanza 2',
      'Refrain',
      'Stanza 3',
      'Refrain',
    ]);
    const text = textOf(html);
    expect(text.split('Morning by morning new mercies I see;').length - 1).toBe(3);
  });

  it('puts the refrain before each stanza where it is sung first (349)', () => {
    expect(sectionsOf(page(349))).toEqual([
      'Refrain',
      'Stanza 1',
      'Refrain',
      'Stanza 2',
      'Refrain',
      'Stanza 3',
    ]);
  });
});
