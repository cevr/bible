import { BunServices } from '@effect/platform-bun';
import { test as plain } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';

import { LESS_MOTION } from './query.ts';

const test = it.effect.layer(BunServices.layer);

/** A style rule as the cascade reads it: the media queries it sits under, its selectors, and the value each property ends with in it. */
interface Rule {
  readonly media: ReadonlyArray<string>;
  readonly selectors: ReadonlyArray<string>;
  readonly declarations: ReadonlyMap<string, string>;
}

/** A stylesheet as rules, and the header of each rule with a block nested in it, which `rules` does not read. */
interface Sheet {
  readonly rules: ReadonlyArray<Rule>;
  readonly nested: ReadonlyArray<string>;
}

/** A selector list split at its own commas, not at those inside `:is()`, `:where()` or `:has()`. */
const selectorsOf = (header: string) => {
  const found: Array<string> = [];
  let depth = 0;
  let selector = '';
  for (const char of header) {
    if (char === ',' && depth === 0) {
      found.push(selector.trim());
      selector = '';
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth--;
    selector += char;
  }
  found.push(selector.trim());
  return found;
};

/**
 * Every style rule of a stylesheet, in source order, with the at-rule blocks
 * it sits in (an `@media` by its query, any other by its whole header). A
 * rule with a block nested in it (`&:hover { … }`) is not read but named in
 * `nested`, so a test refuses what it cannot read.
 */
const rules = (css: string): Sheet => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: Array<Rule> = [];
  const nested: Array<string> = [];
  const within: Array<string> = [];
  let start = 0;
  for (let at = 0; at < text.length; at++) {
    if (text[at] === '}') {
      within.pop();
      start = at + 1;
    }
    if (text[at] !== '{') continue;
    const header = text.slice(start, at).trim().replace(/\s+/g, ' ');
    start = at + 1;
    if (header.startsWith('@')) {
      within.push(header.replace(/^@media /, ''));
      continue;
    }
    const end = text.indexOf('}', at);
    if (text.slice(at + 1, end).includes('{')) {
      nested.push(header);
      at = end;
      start = end + 1;
      continue;
    }
    const declarations = new Map<string, string>();
    for (const line of text.slice(at + 1, end).split(';')) {
      const colon = line.indexOf(':');
      if (colon > 0) declarations.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
    }
    found.push({
      media: [...within],
      selectors: selectorsOf(header),
      declarations,
    });
    at = end;
    start = end + 1;
  }
  return { rules: found, nested };
};

/** The page's stylesheet, read whole. */
const sheetOf = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return rules(yield* fs.readFileString(path.join(import.meta.dir, '..', 'styles.css')));
});

/** The page's stylesheet, as rules. */
const stylesheet = Effect.map(sheetOf, (sheet) => sheet.rules);

/** The only query a hover may stir a card under: a pointer that hovers and is fine. */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/** Each rule that stirs a card on a hover outside the fine-pointer query, by its selectors. */
const ungatedHovers = (sheet: ReadonlyArray<Rule>) =>
  sheet
    .filter(
      (rule) =>
        rule.declarations.has('--stir') &&
        rule.selectors.some((selector) => selector.includes(':hover')) &&
        rule.media.join(' ') !== FINE_POINTER,
    )
    .map((rule) => rule.selectors.join(', '));

/** A value with each `var(--x)` replaced by what `:root` gives `--x`. */
const resolved = (sheet: ReadonlyArray<Rule>, value: string) =>
  value.replace(/var\((--[\w-]+)\)/g, (whole, name: string) =>
    Option.getOrElse(
      Option.fromNullishOr(
        sheet
          .find((rule) => rule.selectors.includes(':root') && rule.declarations.has(name))
          ?.declarations.get(name),
      ),
      () => whole,
    ),
  );

/**
 * Each easing an emblem's stir is written with whose curve leaves 0 to 1
 * (overshoots or springs back): every `cubic-bezier(x1, y1, x2, y2)` of an
 * `.emblem-` rule's transition, with a `y` outside 0 to 1.
 */
const springs = (sheet: ReadonlyArray<Rule>) =>
  sheet
    .filter((rule) => rule.selectors.some((selector) => selector.startsWith('.emblem-')))
    .flatMap((rule) =>
      Array.from(
        resolved(sheet, rule.declarations.get('transition') ?? '').matchAll(
          /cubic-bezier\(([^)]*)\)/g,
        ),
        (m) => ({ rule: rule.selectors.join(', '), curve: (m[1] ?? '').split(',').map(Number) }),
      ),
    )
    .filter(({ curve: [, y1 = 0, , y2 = 0] }) => y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1)
    .map(({ rule, curve }) => `${rule}: cubic-bezier(${curve.join(', ')})`);

/** Each value a property is given for a selector, with the media it is given under, in source order. */
const given = (sheet: ReadonlyArray<Rule>, selector: string, property: string) =>
  sheet
    .filter((rule) => rule.selectors.includes(selector))
    .flatMap((rule) =>
      Option.match(Option.fromNullishOr(rule.declarations.get(property)), {
        onNone: () => [],
        onSome: (value) => [{ media: rule.media, value }],
      }),
    );

describe('the stylesheet as rules', () => {
  plain('are read with their media and their last value for each property', () => {
    expect(
      rules(
        '/* a */ .a { --x: 1; --x: 2 } @media (hover: hover) { .b, .c:hover { --y: 0 !important; } } .d { top: 0 }',
      ).rules,
    ).toEqual([
      { media: [], selectors: ['.a'], declarations: new Map([['--x', '2']]) },
      {
        media: ['(hover: hover)'],
        selectors: ['.b', '.c:hover'],
        declarations: new Map([['--y', '0 !important']]),
      },
      { media: [], selectors: ['.d'], declarations: new Map([['top', '0']]) },
    ]);
  });

  plain('name a rule with a block nested in it, which they do not read', () => {
    expect(rules('.card { &:hover { --stir: 1; } } .d { top: 0 }')).toEqual({
      rules: [{ media: [], selectors: ['.d'], declarations: new Map([['top', '0']]) }],
      nested: ['.card'],
    });
  });

  plain('split a selector list at its own commas, not inside :is()', () => {
    expect(rules('.card:is(:hover, :focus-within), .b { --stir: 1 }').rules[0]?.selectors).toEqual([
      '.card:is(:hover, :focus-within)',
      '.b',
    ]);
  });

  plain('find each hover stir outside the fine-pointer query, however it is written', () => {
    const sheet = rules(
      [
        `@media ${FINE_POINTER} { .card:hover { --stir: 1 } }`,
        '.card:hover { --stir: 1 }',
        '.card:is(:hover, :focus-within) { --stir: 1 }',
        '.cards .card:hover { --stir: 1 }',
        '@supports (display: grid) { .card:hover { --stir: 1 } }',
      ].join(' '),
    );
    expect(ungatedHovers(sheet.rules)).toEqual([
      '.card:hover',
      '.card:is(:hover, :focus-within)',
      '.cards .card:hover',
      '.card:hover',
    ]);
  });

  plain('find an emblem eased with a spring', () => {
    const sheet = rules(
      ':root { --spring: cubic-bezier(0.34, 1.56, 0.64, 1); --calm: cubic-bezier(0.2, 0.7, 0.2, 1) } .emblem-land g { transition: rotate 900ms var(--spring) } .emblem-path g { transition: scale 600ms var(--calm), opacity 600ms var(--calm) }',
    );
    expect(springs(sheet.rules)).toEqual(['.emblem-land g: cubic-bezier(0.34, 1.56, 0.64, 1)']);
  });
});

describe('the motion in the stylesheet', () => {
  test('nests no block in a rule, so every rule is read', () =>
    Effect.gen(function* () {
      expect((yield* sheetOf).nested).toEqual([]);
    }));

  test('pointing stirs a card only where a fine pointer hovers, so a tap leaves no card stirred', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(given(sheet, '.card:hover', '--stir')).toEqual([
        { media: [FINE_POINTER], value: '1' },
      ]);
      expect(ungatedHovers(sheet)).toEqual([]);
    }));

  test('each emblem stirs calmly, its easing never overshooting or springing back', () =>
    Effect.gen(function* () {
      expect(springs(yield* stylesheet)).toEqual([]);
    }));

  test('a card rests unstirred, and a focused or pressed card stirs as a pointed one does', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(given(sheet, '.card', '--stir')).toEqual([
        { media: [], value: '0' },
        { media: [LESS_MOTION], value: '0 !important' },
      ]);
      expect(given(sheet, '.card:active', '--stir')).toEqual([{ media: [], value: '1' }]);
      expect(given(sheet, '.card:has(h3 a:focus-visible)', '--stir')).toEqual([
        { media: [], value: '1' },
      ]);
    }));

  test('for a reader who asks for less motion, the canvases are not shown', () =>
    Effect.gen(function* () {
      expect(given(yield* stylesheet, '.motion', 'display')).toEqual([
        { media: [LESS_MOTION], value: 'none' },
      ]);
    }));

  test('a canvas is laid over its still and shown only once it has drawn', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(given(sheet, '.motion', 'position')).toEqual([{ media: [], value: 'absolute' }]);
      expect(given(sheet, '.motion', 'pointer-events')).toEqual([{ media: [], value: 'none' }]);
      expect(given(sheet, '.motion', 'opacity')).toEqual([{ media: [], value: '0' }]);
      expect(given(sheet, '.motion-on', 'opacity')).toEqual([{ media: [], value: '1' }]);
    }));
});
