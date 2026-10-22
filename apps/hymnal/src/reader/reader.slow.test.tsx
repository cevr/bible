/**
 * The list and the hymn page, rendered to HTML as the web build renders
 * them, over the real compiled hymnal (`src/test/setup.ts`).
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import { hymnAt, hymns } from '~/hymns/hymns';

import { readerOn } from '../test/reader';
import { HymnList } from './HymnList';
import { HymnPage } from './HymnPage';
import { hymnsOffset } from './place';

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

const hymn = (n: number) => Option.getOrThrow(hymnAt(String(n)));

const page = (n: number) => renderToStaticMarkup(<HymnPage hymn={hymn(n)} reader={readerOn()} />);

describe('the hymn list', () => {
  it('holds every hymn of the 1985 hymnal, 1 to 695 in order', () => {
    expect(hymns).toHaveLength(695);
    expect(hymns.map((h) => h.number)).toEqual(Array.from({ length: 695 }, (_, k) => k + 1));
  });

  it('shows each row as its number and title, linking to the hymn', () => {
    const html = renderToStaticMarkup(
      <HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />,
    );
    expect(html).toContain('aria-label="1, Praise to the Lord"');
    expect(html).toContain('href="/hymns/1"');
    expect(textOf(html)).toContain('1 Praise to the Lord 2 All Creatures of Our God and King');
  });

  it('says so when it has no hymn to show', () => {
    const html = renderToStaticMarkup(
      <HymnList
        hymns={[]}
        hrefOf={(n) => `/hymns/${n}`}
        offset={hymnsOffset}
        empty="No hymn matches “zzq”."
      />,
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

/** `node` mounted in the document, as a phone or the web shows it; it unmounts when the `using` ends. */
const mount = (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryProvider>{node}</RegistryProvider>));
  return {
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const press = (host: HTMLElement, label: string) =>
  act(() => {
    const target = Option.getOrThrow(
      Option.fromNullishOr(host.querySelector<HTMLElement>(`[aria-label="${label}"]`)),
    );
    target.click();
  });

/** The text of the box with test id `id`, or none where the page has no such box. */
const chordAt = (host: HTMLElement, id: string) =>
  Option.map(
    Option.fromNullishOr(host.querySelector(`[data-testid="${id}"]`)),
    (box) => box.textContent,
  );

/** Each section's text, in page order. */
const sectionTexts = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="group"]')].map((group) => textOf(group.innerHTML));

/** A reader who has turned chords on. */
const chordsOn = () => new Map([['chords', 'true']]);

describe('a hymn page with chords off', () => {
  it('shows the words alone, with the switch off and no key control, and decodes no chords', () => {
    const reader = readerOn();
    const html = renderToStaticMarkup(<HymnPage hymn={hymn(100)} reader={reader} />);
    expect(html).not.toContain('data-testid="chord-');
    expect(html).not.toContain('Transpose');
    expect(html).not.toContain('Capo');
    expect(html).toContain('role="switch"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('aria-label="Chords"');
    expect(reader.book.decodes()).toBe(0);
  });
});

describe('a hymn page with chords on', () => {
  it('puts the chords over their syllables in the printed key, and follows the transpose and capo', () => {
    const reader = readerOn(chordsOn());
    using app = mount(<HymnPage hymn={hymn(100)} reader={reader} />);
    const { host } = app;
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('Db'));
    expect(textOf(host.innerHTML)).toContain('Key Db');
    expect(textOf(host.innerHTML)).toContain('No capo');

    press(host, 'Transpose up');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('D'));
    press(host, 'Capo up');
    press(host, 'Capo up');
    expect(textOf(host.innerHTML)).toContain('Capo 2, C shapes');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('C'));
    press(host, 'Transpose up');
    expect(textOf(host.innerHTML)).toContain('Key Eb');
    expect(chordAt(host, 'chord-1-1-1')).toEqual(Option.some('Db'));
    expect(reader.book.decodes()).toBe(1);
  });

  it('shows the words alone again once the switch is turned off', () => {
    const words = (() => {
      using app = mount(<HymnPage hymn={hymn(100)} reader={readerOn()} />);
      return sectionTexts(app.host);
    })();
    using app = mount(<HymnPage hymn={hymn(100)} reader={readerOn(chordsOn())} />);
    const { host } = app;
    expect(host.querySelector<HTMLInputElement>('[role="switch"]')?.checked).toBe(true);
    press(host, 'Chords');
    expect(host.querySelector<HTMLInputElement>('[role="switch"]')?.checked).toBe(false);
    expect(host.querySelector('[data-testid^="chord-"]')).toBeNull();
    expect(textOf(host.innerHTML)).not.toContain('Transpose');
    expect(sectionTexts(host)).toEqual(words);
  });

  it('shows each hymn with no chords as its words and a notice, with no key control', () => {
    const chordless = [
      126, 181, 212, 220, 225, 262, 292, 305, 403, 453, 481, 580, 663, 664, 687, 693,
    ];
    for (const n of chordless) {
      const words = (() => {
        using app = mount(<HymnPage hymn={hymn(n)} reader={readerOn()} />);
        return sectionTexts(app.host);
      })();
      using app = mount(<HymnPage hymn={hymn(n)} reader={readerOn(chordsOn())} />);
      const text = textOf(app.host.innerHTML);
      expect({ n, notice: text.includes('No chords for this hymn yet.') }).toEqual({
        n,
        notice: true,
      });
      expect({ n, keys: text.includes('Transpose') }).toEqual({ n, keys: false });
      expect({ n, words: sectionTexts(app.host) }).toEqual({ n, words });
    }
  });
});
