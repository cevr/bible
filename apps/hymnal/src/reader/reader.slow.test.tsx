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
import { StyleSheet, View } from 'react-native';

import { hymnAt, hymns } from '~/hymns/hymns';

import { readerOn } from '../test/reader';
import { ChordsButton } from './HeaderButtons';
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

const rowSheet = StyleSheet.create({ row: { flexDirection: 'row' } });

/** The class react-native-web draws a row (`flexDirection: 'row'`) with. */
const rowClass = Option.getOrThrow(
  Option.fromNullishOr(
    /r-flexDirection-\w+/.exec(renderToStaticMarkup(<View style={rowSheet.row} />))?.[0],
  ),
);

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

  it('heads hymn 15 with its topic as a quiet line, above its number and title in one row', () => {
    const html = page(15);
    const { number, title, topic } = hymn(15);
    const head = html.slice(0, html.indexOf('role="group"'));
    const topicAt = head.lastIndexOf('<', head.indexOf('data-testid="hymn-topic"'));
    const nameAt = head.lastIndexOf('<', head.indexOf('data-testid="hymn-name"'));
    // The topic is its own line above the row, apart from the heading.
    expect(textOf(head.slice(0, topicAt))).toBe('');
    expect(textOf(head.slice(topicAt, nameAt))).toBe(topic);
    // The row lays its pieces side by side (the class a row View draws with): the number, then the title.
    const row = head.slice(nameAt);
    expect(row.slice(0, row.indexOf('>'))).toContain(rowClass);
    expect(textOf(row).startsWith(`${number} ${title}`)).toBe(true);
    expect(row.indexOf(`>${number}<`)).toBeLessThan(row.indexOf('role="heading"'));
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
  it('shows the words alone, with no chords control in its body and no key control, and decodes no chords', () => {
    const reader = readerOn();
    const html = renderToStaticMarkup(<HymnPage hymn={hymn(100)} reader={reader} />);
    expect(html).not.toContain('data-testid="chord-');
    expect(html).not.toContain('Transpose');
    expect(html).not.toContain('Capo');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('aria-label="Chords"');
    expect(reader.book.decodes()).toBe(0);
  });
});

/** The header's `Chords` button over `n`'s page, both over `reader`. */
const withButton = (n: number, reader: ReturnType<typeof readerOn>) => (
  <>
    <ChordsButton chords={reader.chords} />
    <HymnPage hymn={hymn(n)} reader={reader} />
  </>
);

/** The `Chords` button: a button, whether it is selected, and whether it draws the guitar's head. */
const chordsButton = (host: HTMLElement) =>
  Option.map(Option.fromNullishOr(host.querySelector('[aria-label="Chords"]')), (button) => ({
    role: button.getAttribute('role'),
    selected: button.getAttribute('aria-selected'),
    head: Option.isSome(Option.fromNullishOr(button.querySelector('[data-testid="guitar-head"]'))),
  }));

const chordRows = (host: HTMLElement) => host.querySelectorAll('[data-testid^="chord-"]').length;

describe('the header’s Chords button', () => {
  it('turns chords on for every hymn: hymn 3 and hymn 5 both show their chord rows', () => {
    const device = new Map<string, string>();
    {
      using app = mount(withButton(3, readerOn(device)));
      expect(chordsButton(app.host)).toEqual(
        Option.some({ role: 'button', selected: 'false', head: true }),
      );
      expect(chordRows(app.host)).toBe(0);
      press(app.host, 'Chords');
      expect(chordsButton(app.host)).toEqual(
        Option.some({ role: 'button', selected: 'true', head: true }),
      );
      expect(chordRows(app.host)).toBeGreaterThan(0);
    }
    using app = mount(withButton(5, readerOn(device)));
    expect(chordsButton(app.host)).toEqual(
      Option.some({ role: 'button', selected: 'true', head: true }),
    );
    expect(chordRows(app.host)).toBeGreaterThan(0);
  });

  it('puts the key controls at the page’s top while chords are on, with no tap, and takes them away when off', () => {
    using app = mount(withButton(3, readerOn()));
    const text = () => textOf(app.host.innerHTML);
    expect(text()).not.toContain('Transpose');
    press(app.host, 'Chords');
    for (const label of ['Transpose down', 'Transpose up', 'Capo down', 'Capo up']) {
      const shown = Option.isSome(
        Option.fromNullishOr(app.host.querySelector(`[aria-label="${label}"]`)),
      );
      expect({ label, shown }).toEqual({ label, shown: true });
    }
    // The controls come before the first section's words.
    const controls = Option.getOrThrow(
      Option.fromNullishOr(app.host.querySelector('[aria-label="Transpose up"]')),
    );
    const first = Option.getOrThrow(Option.fromNullishOr(app.host.querySelector('[role="group"]')));
    expect(controls.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    press(app.host, 'Chords');
    expect(chordsButton(app.host)).toEqual(
      Option.some({ role: 'button', selected: 'false', head: true }),
    );
    expect(text()).not.toContain('Transpose');
    expect(text()).not.toContain('Capo');
    expect(chordRows(app.host)).toBe(0);
  });

  it('opens selected, chords shown, over a store that kept chords on', () => {
    using app = mount(withButton(3, readerOn(chordsOn())));
    expect(chordsButton(app.host)).toEqual(
      Option.some({ role: 'button', selected: 'true', head: true }),
    );
    expect(chordRows(app.host)).toBeGreaterThan(0);
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

  it('shows the words alone again once chords are turned off', () => {
    const words = (() => {
      using app = mount(<HymnPage hymn={hymn(100)} reader={readerOn()} />);
      return sectionTexts(app.host);
    })();
    using app = mount(withButton(100, readerOn(chordsOn())));
    const { host } = app;
    expect(chordsButton(host)).toEqual(
      Option.some({ role: 'button', selected: 'true', head: true }),
    );
    press(host, 'Chords');
    expect(chordsButton(host)).toEqual(
      Option.some({ role: 'button', selected: 'false', head: true }),
    );
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

/** The page head's `Favourite` button: a button in the number's row, and whether it is selected. */
const favouriteButton = (host: HTMLElement) =>
  Option.map(
    Option.fromNullishOr(host.querySelector('[data-testid="hymn-name"] [aria-label="Favourite"]')),
    (button) => ({
      role: button.getAttribute('role'),
      selected: button.getAttribute('aria-selected'),
    }),
  );

describe('the page head’s Favourite button', () => {
  it('sits in the number’s row; a press keeps the hymn under lists.favourites, a second press takes it out', () => {
    const device = new Map<string, string>();
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(device)} />);
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'false' }));
    press(app.host, 'Favourite');
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'true' }));
    expect(device.get('lists.favourites')).toBe('[3]');
    press(app.host, 'Favourite');
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'false' }));
    expect(device.get('lists.favourites')).toBe('[]');
  });

  it('keeps Favourites in number order, and shows a favourite selected when the app is opened again', () => {
    const device = new Map<string, string>();
    {
      using app = mount(<HymnPage hymn={hymn(30)} reader={readerOn(device)} />);
      press(app.host, 'Favourite');
    }
    {
      using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(device)} />);
      press(app.host, 'Favourite');
    }
    expect(device.get('lists.favourites')).toBe('[3,30]');
    using app = mount(<HymnPage hymn={hymn(30)} reader={readerOn(device)} />);
    expect(favouriteButton(app.host)).toEqual(Option.some({ role: 'button', selected: 'true' }));
  });
});
