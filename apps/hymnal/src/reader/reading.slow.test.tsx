/**
 * The reading settings as a reader meets them: the `Aa` button in a hymn
 * page's header, the reading sheet it opens, the page set as the sheet
 * says, the screen kept on while a page is shown, and each printed line
 * hanging under its first word when it wraps.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { hymnAt } from '~/hymns/hymns';

import { awake, opened, params } from '../test/one';
import { readerOn } from '../test/reader';
import { StackHeader } from '../test/stack';
import { HymnPage } from './HymnPage';
import { HymnScreen } from './HymnScreen';
import { ReadingSheet } from './ReadingSheet';
import { DEFAULT_SIZE, pointsAt, SIZES } from './reading';

const hymn = (n: number) => Option.getOrThrow(hymnAt(String(n)));

/** `node` mounted in the document; it unmounts when the `using` ends. */
const mount = (node: ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<RegistryProvider>{node}</RegistryProvider>));
  const find = (selector: string) =>
    Option.fromNullishOr(host.querySelector<HTMLElement>(selector));
  const get = (selector: string) => Option.getOrThrow(find(selector));
  return {
    host,
    find,
    get,
    press: (label: string) => act(() => get(`[aria-label="${label}"]`).click()),
    unmount: () => act(() => root.unmount()),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const checked = (app: ReturnType<typeof mount>, group: string) =>
  [...app.get(`[role="radiogroup"][aria-label="${group}"]`).querySelectorAll('[role="radio"]')]
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.getAttribute('aria-label'));

const disabled = (app: ReturnType<typeof mount>, label: string) =>
  app.get(`[aria-label="${label}"]`).getAttribute('aria-disabled') === 'true';

describe('the hymn page’s Aa button', () => {
  it('sits in the header before Chords, as a button, and opens the reading sheet', () => {
    opened.splice(0);
    params['number'] = '3';
    using app = mount(
      <>
        <StackHeader />
        <HymnScreen />
      </>,
    );
    const header = app.get('[data-testid="header"]');
    const buttons = [...header.querySelectorAll('[role="button"]')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(buttons).toEqual(['Aa', 'Chords']);
    app.press('Aa');
    expect(opened).toEqual(['/reading']);
  });
});

describe('the reading sheet', () => {
  it('steps the text size within its ends, and shows the size it is at', () => {
    using app = mount(<ReadingSheet reading={readerOn().reading} />);
    const share = () => app.get('[aria-label^="Text size"]').textContent;
    expect(share()).toBe('100%');
    expect(disabled(app, 'Smaller text')).toBe(false);
    for (let k = DEFAULT_SIZE; k < SIZES.length - 1; k++) app.press('Larger text');
    expect(disabled(app, 'Larger text')).toBe(true);
    expect(share()).toBe(`${Math.round((pointsAt(SIZES.length - 1) / 17) * 100)}%`);
    for (let k = SIZES.length - 1; k > 0; k--) app.press('Smaller text');
    expect(disabled(app, 'Smaller text')).toBe(true);
    expect(disabled(app, 'Larger text')).toBe(false);
  });

  it('writes each choice under its reading key, and a fresh launch reads them back', () => {
    const device = new Map<string, string>();
    {
      using app = mount(<ReadingSheet reading={readerOn(device).reading} />);
      expect(checked(app, 'Font')).toEqual(['System']);
      expect(checked(app, 'Line spacing')).toEqual(['Normal']);
      const radios = (group: string) =>
        [
          ...app
            .get(`[role="radiogroup"][aria-label="${group}"]`)
            .querySelectorAll('[role="radio"]'),
        ].map((radio) => radio.getAttribute('aria-label'));
      expect(radios('Font')).toEqual(['System', 'Serif']);
      expect(radios('Line spacing')).toEqual(['Compact', 'Normal', 'Roomy']);
      app.press('Larger text');
      app.press('Serif');
      app.press('Roomy');
      act(() => app.get('[aria-label="Keep screen on"]').click());
      expect(Object.fromEntries(device)).toEqual({
        'reading.size': String(DEFAULT_SIZE + 1),
        'reading.font': '"serif"',
        'reading.spacing': '"roomy"',
        'reading.awake': 'true',
      });
    }
    using again = mount(<ReadingSheet reading={readerOn(device).reading} />);
    expect(again.get('[aria-label^="Text size"]').textContent).toBe(
      `${Math.round((pointsAt(DEFAULT_SIZE + 1) / 17) * 100)}%`,
    );
    expect(checked(again, 'Font')).toEqual(['Serif']);
    expect(checked(again, 'Line spacing')).toEqual(['Roomy']);
    expect((again.get('[aria-label="Keep screen on"]') as HTMLInputElement).checked).toBe(true);
  });
});

/** A text's size, line height and family as drawn. */
const drawn = (text: HTMLElement) => {
  const style = getComputedStyle(text);
  return { size: style.fontSize, height: style.lineHeight, family: style.fontFamily };
};

/** The words' style on a page of words alone, and the chords' on the page under chords, over `device`'s reading. */
const pageStyle = (reading: ReadonlyArray<readonly [string, string]>) => {
  using words = mount(<HymnPage hymn={hymn(3)} reader={readerOn(new Map(reading))} />);
  using chords = mount(
    <HymnPage hymn={hymn(3)} reader={readerOn(new Map([...reading, ['chords', 'true']]))} />,
  );
  return {
    words: drawn(words.get('[data-testid="line"] > *')),
    chords: drawn(chords.get('[data-testid^="chord-"]')),
  };
};

describe('a hymn page as the reading sheet sets it', () => {
  it('renders the default as the page has always been: words 17 on 24, chords 15 on 20, the system face', () => {
    const style = pageStyle([]);
    expect(style.words).toMatchObject({ size: '17px', height: '24px' });
    expect(style.chords).toMatchObject({ size: '15px', height: '20px' });
    expect(style.words.family).not.toContain('Georgia');
    expect(style.chords.family).not.toContain('Georgia');
  });

  it('sets the words and chord rows in the chosen size, face and spacing', () => {
    const style = pageStyle([
      ['reading.size', String(SIZES.length - 1)],
      ['reading.font', '"serif"'],
      ['reading.spacing', '"roomy"'],
    ]);
    expect(style.words).toMatchObject({
      size: '32px',
      height: `${Math.round((32 * 29) / 17)}px`,
    });
    expect(style.chords).toMatchObject({
      size: `${Math.round((15 * 32) / 17)}px`,
      height: `${Math.round((20 * 32) / 17)}px`,
    });
    expect(style.words.family).toContain('Georgia');
    expect(style.chords.family).toContain('Georgia');
  });
});

describe('keeping the screen on', () => {
  it('holds only while a hymn page is shown with the switch on, and lets go when either ends', () => {
    awake.clear();
    const reader = readerOn();
    const app = mount(
      <>
        <ReadingSheet reading={reader.reading} />
        <HymnPage hymn={hymn(1)} reader={reader} />
      </>,
    );
    expect(awake.size).toBe(0);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(1);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(0);
    act(() => app.get('[aria-label="Keep screen on"]').click());
    expect(awake.size).toBe(1);
    app[Symbol.dispose]();
    expect(awake.size).toBe(0);
  });
});

/** Each printed line's indent: its container's left padding and its first item's pull back. */
const indents = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')].map((line) => ({
    padding: getComputedStyle(line).paddingLeft,
    first: getComputedStyle(Option.getOrThrow(Option.fromNullishOr(line.firstElementChild)))
      .marginLeft,
  }));

describe('a printed line', () => {
  it('hangs under its first word, plain or under chords, by the indent at the reader’s size', () => {
    for (const [device, indent] of [
      [new Map<string, string>(), 21],
      [new Map([['chords', 'true']]), 21],
      [new Map([['reading.size', String(SIZES.length - 1)]]), 40],
    ] as const) {
      using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn(new Map(device))} />);
      const lines = indents(app.host);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines)
        expect(line).toEqual({ padding: `${indent}px`, first: `-${indent}px` });
    }
  });

  it('stays one element that reads the whole line', () => {
    using app = mount(<HymnPage hymn={hymn(3)} reader={readerOn()} />);
    const lines = [...app.host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
    const sung = hymn(3).sections.flatMap((section) => section.lines);
    expect(lines.map((line) => line.getAttribute('aria-label'))).toEqual(sung);
    expect(lines.map((line) => line.textContent?.replaceAll(' ', ' '))).toEqual(sung);
  });
});
