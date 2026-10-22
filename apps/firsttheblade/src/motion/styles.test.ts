/**
 * The motion in the page's stylesheet, read with a CSS parser (lightningcss,
 * the one Vite builds the sheet with): its rules as the parser gives them,
 * nested ones and those under `@supports`, `@layer` or `@scope` too (a scope's
 * root read as a parent rule), so no way of writing a rule hides it. Expected values are written as CSS and read the
 * same way, so a rule is compared by what it means, not by its text.
 */
import { BunServices } from '@effect/platform-bun';
import { test as plain } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Equal, FileSystem, Option, Path } from 'effect';
import {
  transform,
  type Declaration,
  type EasingFunction,
  type MediaCondition,
  type MediaQuery,
  type Rule as CssRule,
  type Selector,
  type SelectorComponent,
  type SelectorList,
  type TokenOrValue,
} from 'lightningcss';

import { LESS_MOTION } from './query.ts';

const test = it.effect.layer(BunServices.layer);

/** A declaration of a rule, and whether it is `!important`. */
interface Given {
  readonly declaration: Declaration;
  readonly important: boolean;
}

/**
 * A style rule as the cascade reads it: the query list of each `@media` it
 * sits under (outermost first), its own selectors and its parents', its
 * declarations, and its header in the source. A nested rule's declarations
 * after its children (`nested-declarations`) are a rule of their own with
 * its parent's selectors and header.
 */
interface Rule {
  readonly media: ReadonlyArray<ReadonlyArray<MediaQuery>>;
  readonly chain: ReadonlyArray<SelectorList>;
  readonly declarations: ReadonlyArray<Given>;
  readonly header: string;
}

/** A stylesheet's rules as the parser reads them; a sheet it cannot read throws. */
const parsed = (css: string) => {
  const read: Array<CssRule> = [];
  transform({
    filename: 'styles.css',
    code: new TextEncoder().encode(css),
    visitor: {
      StyleSheet(sheet) {
        read.push(...sheet.rules);
      },
    },
  });
  return read;
};

/** The source from a rule's start (a 0-based line, a 1-based column) to its block, for naming it in a failure. */
const headerAt = (css: string, line: number, column: number) => {
  const lines = css.split('\n');
  const start = lines.slice(0, line).reduce((at, text) => at + text.length + 1, 0) + column - 1;
  return css.slice(start, css.indexOf('{', start)).trim().replace(/\s+/g, ' ');
};

/** The rules an at-rule holds that apply wherever it sits (`@supports`, `@layer`, `@container`, `@starting-style`, `@-moz-document`); none for any other rule. */
const opened = (rule: CssRule): ReadonlyArray<CssRule> => {
  if (
    rule.type === 'supports' ||
    rule.type === 'layer-block' ||
    rule.type === 'container' ||
    rule.type === 'starting-style' ||
    rule.type === 'moz-document'
  )
    return rule.value.rules;
  return [];
};

/** A rule's declarations, the `!important` ones marked. */
const declared = (
  block: {
    readonly declarations?: Array<Declaration>;
    readonly importantDeclarations?: Array<Declaration>;
  } = {},
): ReadonlyArray<Given> => [
  ...(block.declarations ?? []).map((declaration) => ({ declaration, important: false })),
  ...(block.importantDeclarations ?? []).map((declaration) => ({ declaration, important: true })),
];

/** Every style rule of a stylesheet, in source order, with the `@media` queries and the parent rules it sits in, a `@scope` rule's root among them. */
const rules = (css: string): ReadonlyArray<Rule> => {
  const found: Array<Rule> = [];
  const walk = (
    list: ReadonlyArray<CssRule>,
    media: ReadonlyArray<ReadonlyArray<MediaQuery>>,
    chain: ReadonlyArray<SelectorList>,
    parent: string,
  ): void => {
    for (const rule of list) {
      if (rule.type === 'media')
        walk(rule.value.rules, [...media, rule.value.query.mediaQueries], chain, parent);
      walk(opened(rule), media, chain, parent);
      // A rule under `@scope (<root>)` matches only within the root, as one nested under it does.
      if (rule.type === 'scope')
        walk(
          rule.value.rules,
          media,
          Option.match(Option.fromNullishOr(rule.value.scopeStart), {
            onNone: () => chain,
            onSome: (root) => [...chain, root],
          }),
          parent,
        );
      if (rule.type === 'nested-declarations')
        found.push({
          media,
          chain,
          declarations: declared(rule.value.declarations),
          header: parent,
        });
      if (rule.type === 'style') {
        const own = [...chain, rule.value.selectors];
        const header = headerAt(css, rule.value.loc.line, rule.value.loc.column);
        found.push({ media, chain: own, declarations: declared(rule.value.declarations), header });
        walk(rule.value.rules ?? [], media, own, header);
      }
    }
  };
  walk(parsed(css), [], [], '');
  return found;
};

/** The page's stylesheet, as rules. */
const stylesheet = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return rules(yield* fs.readFileString(path.join(import.meta.dir, '..', 'styles.css')));
});

/** The property a declaration sets, custom ones by their `--` name. */
const nameOf = (declaration: Declaration) => {
  if (declaration.property === 'custom') return declaration.value.name;
  if (declaration.property === 'unparsed') return declaration.value.propertyId.property;
  return declaration.property;
};

/** The selectors a selector component holds: those of `:not()`, `:is()`, `:where()`, `:has()`, `:nth-child(… of …)`, `::slotted()` and the like. */
const inner = (component: SelectorComponent): ReadonlyArray<Selector> => {
  if (component.type !== 'pseudo-class' && component.type !== 'pseudo-element') return [];
  if (component.kind === 'host') return Option.toArray(Option.fromNullishOr(component.selectors));
  if ('selectors' in component) return component.selectors;
  if ('selector' in component) return [component.selector];
  if ('of' in component) return component.of ?? [];
  return [];
};

/** Whether a component is `:not()`, under which a match flips. */
const negates = (component: SelectorComponent) =>
  component.type === 'pseudo-class' && component.kind === 'not';

/** Whether a selector holds `&`, anywhere in it. */
const nests = (selector: Selector): boolean =>
  selector.some((component) => component.type === 'nesting' || inner(component).some(nests));

/**
 * Whether a selector can match while a pointer hovers: a `:hover` it holds
 * that no odd count of `:not()` negates, inside `:is()`, `:where()`,
 * `:has()` or any other selector argument too; or an `&` (at that `&`'s
 * polarity) when its parent rule can.
 */
const hoversIn = (selector: Selector, positive: boolean, parent: boolean): boolean =>
  selector.some((component) => {
    if (component.type === 'pseudo-class' && component.kind === 'hover') return positive;
    if (component.type === 'nesting') return positive && parent;
    return inner(component).some((held) => hoversIn(held, positive !== negates(component), parent));
  });

/**
 * Whether a rule can match an element while a pointer hovers one: its own
 * selector can, or a parent rule can and the rule names it by `&` or, with
 * no `&`, sits under it.
 */
const hovers = (chain: ReadonlyArray<SelectorList>): boolean =>
  chain.reduce<boolean>(
    (parent, list, depth) =>
      list.some(
        (selector) => hoversIn(selector, true, parent) || (depth > 0 && !nests(selector) && parent),
      ),
    false,
  );

/** Whether a media condition holds only where `name` is `value`. */
const requires = (condition: MediaCondition, name: string, value: string): boolean => {
  if (condition.type === 'feature')
    return (
      condition.value.type === 'plain' &&
      condition.value.name === name &&
      condition.value.value.type === 'ident' &&
      condition.value.value.value === value
    );
  if (condition.type !== 'operation') return false;
  if (condition.operator === 'and')
    return condition.conditions.some((part) => requires(part, name, value));
  return condition.conditions.every((part) => requires(part, name, value));
};

/** Whether a media query list matches only a pointer that hovers and is fine: each of its queries requires both. */
const finePointer = (queries: ReadonlyArray<MediaQuery>) =>
  queries.every(
    (query) =>
      query.qualifier !== 'not' &&
      Option.exists(
        Option.fromNullishOr(query.condition),
        (condition) =>
          requires(condition, 'hover', 'hover') && requires(condition, 'pointer', 'fine'),
      ),
  );

/** The only query a hover may stir a card under: a pointer that hovers and is fine. */
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * Each rule that sets `--stir` and can match a card while a pointer hovers,
 * with no `@media` above it that matches only a fine pointer that hovers, by
 * its header in the source.
 */
const ungatedHovers = (sheet: ReadonlyArray<Rule>) =>
  sheet
    .filter(
      (rule) =>
        rule.declarations.some(({ declaration }) => nameOf(declaration) === '--stir') &&
        hovers(rule.chain) &&
        !rule.media.some(finePointer),
    )
    .map((rule) => rule.header);

/** Whether a selector holds a class starting `emblem-`, anywhere in it. */
const namesEmblem = (selector: Selector): boolean =>
  selector.some(
    (component) =>
      (component.type === 'class' && component.name.startsWith('emblem-')) ||
      inner(component).some(namesEmblem),
  );

/** Whether a rule names an emblem, in its own selectors or its parents'. */
const isEmblem = (chain: ReadonlyArray<SelectorList>) =>
  chain.some((list) => list.some(namesEmblem));

/** The value `:root` gives each custom property, as tokens. */
const rootValues = (sheet: ReadonlyArray<Rule>) => {
  const root = rules(':root {}')[0]?.chain;
  const values = new Map<string, ReadonlyArray<TokenOrValue>>();
  for (const rule of sheet.filter(({ chain }) => Equal.equals(chain, root)))
    for (const { declaration } of rule.declarations)
      if (declaration.property === 'custom')
        values.set(declaration.value.name, declaration.value.value);
  return values;
};

/** Tokens with each `var(--x)` replaced by what `:root` gives `--x` (else its fallback), over and over. */
const resolved = (
  tokens: ReadonlyArray<TokenOrValue>,
  root: ReadonlyMap<string, ReadonlyArray<TokenOrValue>>,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<TokenOrValue> =>
  tokens.flatMap((token) => {
    if (token.type !== 'var') return [token];
    const name = token.value.name.ident;
    const given = Option.fromUndefinedOr(root.get(name)).pipe(
      Option.orElse(() => Option.fromNullishOr(token.value.fallback)),
      Option.filter(() => !seen.has(name)),
    );
    return Option.match(given, {
      onNone: () => [token],
      onSome: (value) => resolved(value, root, new Set([...seen, name])),
    });
  });

/** An easing: a `cubic-bezier()` by its four numbers, a `linear()` by its outputs. */
interface Easing {
  readonly kind: 'cubic-bezier' | 'linear';
  readonly numbers: ReadonlyArray<number>;
}

/** Each easing written in tokens. */
const tokenEasings = (tokens: ReadonlyArray<TokenOrValue>): ReadonlyArray<Easing> =>
  tokens.flatMap((token) => {
    if (token.type !== 'function') return [];
    const numbers = token.value.arguments.flatMap((argument) => {
      if (argument.type === 'token' && argument.value.type === 'number')
        return [argument.value.value];
      return [];
    });
    const kinds: ReadonlyArray<Easing['kind']> = ['cubic-bezier', 'linear'];
    return kinds
      .filter((kind) => kind === token.value.name)
      .map((kind): Easing => ({ kind, numbers }));
  });

/** A typed easing, as an `Easing` when it can leave 0 to 1. */
const typedEasing = (easing: EasingFunction): ReadonlyArray<Easing> => {
  if (easing.type !== 'cubic-bezier') return [];
  return [{ kind: 'cubic-bezier', numbers: [easing.x1, easing.y1, easing.x2, easing.y2] }];
};

/** Each easing a declaration eases a transition with, typed or in tokens. */
const easings = (
  declaration: Declaration,
  root: ReadonlyMap<string, ReadonlyArray<TokenOrValue>>,
): ReadonlyArray<Easing> => {
  if (declaration.property === 'transition')
    return declaration.value.flatMap(({ timingFunction }) => typedEasing(timingFunction));
  if (declaration.property === 'transition-timing-function')
    return declaration.value.flatMap(typedEasing);
  if (
    declaration.property === 'unparsed' &&
    ['transition', 'transition-timing-function'].includes(declaration.value.propertyId.property)
  )
    return tokenEasings(resolved(declaration.value.value, root));
  return [];
};

/** Whether an easing leaves 0 to 1: a `cubic-bezier` with a `y` outside it, or a `linear()` output outside it. */
const springs = (easing: Easing) => {
  const outside = (n: number) => n < 0 || n > 1;
  if (easing.kind === 'cubic-bezier')
    return [easing.numbers[1] ?? 0, easing.numbers[3] ?? 0].some(outside);
  return easing.numbers.some(outside);
};

/** A curve's numbers rounded to four places, as written. */
const written = (numbers: ReadonlyArray<number>) =>
  numbers.map((n) => Math.round(n * 1e4) / 1e4).join(', ');

/**
 * Each easing an emblem's stir is written with whose curve leaves 0 to 1
 * (overshoots or springs back), named by its rule's header and the curve.
 */
const sprung = (sheet: ReadonlyArray<Rule>) => {
  const root = rootValues(sheet);
  return sheet
    .filter((rule) => isEmblem(rule.chain))
    .flatMap((rule) =>
      rule.declarations
        .flatMap(({ declaration }) => easings(declaration, root))
        .filter(springs)
        .map(({ kind, numbers }) => `${rule.header}: ${kind}(${written(numbers)})`),
    );
};

/** Each value a property is given for a selector list (written as CSS), with the media it is given under, in source order. */
const given = (sheet: ReadonlyArray<Rule>, selector: string, property: string) => {
  const target = rules(`${selector} {}`)[0]?.chain;
  return sheet
    .filter((rule) => Equal.equals(rule.chain, target))
    .flatMap((rule) =>
      rule.declarations
        .filter(({ declaration }) => nameOf(declaration) === property)
        .map(({ declaration, important }) => ({ media: rule.media, declaration, important })),
    );
};

/** What `given` reads from a sheet written as CSS: what a test expects, read as the sheet is. */
const expected = (css: string, selector: string, property: string) =>
  given(rules(css), selector, property);

/** A list with at least one item. */
type Some<A> = readonly [A, ...ReadonlyArray<A>];

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

/** A sheet with one hover stir, written one way, and whether a fine-pointer query gates it. */
interface Written {
  readonly css: string;
  readonly gated: boolean;
}

/** The queries that gate a hover stir, and the ones that look as if they do and do not. */
const GATES: Some<string> = [
  FINE_POINTER,
  '(pointer: fine) and (hover: hover)',
  'screen and (hover: hover) and (pointer: fine)',
  '(hover: hover) and (pointer: fine) and (min-width: 48rem)',
];
const NEAR_GATES: Some<string> = [
  '(hover: hover)',
  '(pointer: fine)',
  '(hover: hover) or (pointer: fine)',
  'not all and (hover: hover) and (pointer: fine)',
  `${FINE_POINTER}, print`,
  '(any-hover: hover) and (any-pointer: fine)',
];

/** Ways a selector names a hovered card, each a rule `{}`-ready, or a nested pair. */
const HOVERED: Some<(body: string) => string> = [
  (body) => `.card:hover { ${body} }`,
  (body) => `.cards .card:HOVER { ${body} }`,
  (body) => `.cards > .card:hover { ${body} }`,
  (body) => `.card:is(:hover, :focus-within) { ${body} }`,
  (body) => `.card:where(.lit, :hover) { ${body} }`,
  (body) => `.card:not(:not(:hover)) { ${body} }`,
  (body) => `.card:has(h3 a:hover) { ${body} }`,
  (body) => `.cards:hover .card { ${body} }`,
  (body) => `.card, .other:hover { ${body} }`,
  (body) => `.card { &:hover { ${body} } }`,
  (body) => `.card { :is(&:hover) { ${body} } }`,
  (body) => `.cards:hover { .card { ${body} } }`,
  (body) => `.cards:hover { & > .card { ${body} } }`,
  (body) => `@scope (.cards:hover) { .card { ${body} } }`,
  (body) => `@scope (.cards) { :scope:hover .card { ${body} } }`,
  (body) => `@scope (.cards:is(:hover)) to (.lit) { & > .card { ${body} } }`,
];

/** Ways a selector names a card that is not hovered, which may stir anywhere. */
const UNHOVERED: Some<(body: string) => string> = [
  (body) => `.card:not(:hover) { ${body} }`,
  (body) => `.card:active { ${body} }`,
  (body) => `.card:has(h3 a:focus-visible) { ${body} }`,
  (body) => `.cards:hover { :not(&) .card { ${body} } }`,
  (body) => `@scope (.cards) to (.card:hover) { .card { ${body} } }`,
  (body) => `@scope (.cards:not(:hover)) { .card { ${body} } }`,
];

/** Declarations that sit beside a stir, braces, semicolons and comment marks in strings and URLs among them. */
const BESIDE: Some<string> = [
  'content: "}";',
  'content: "\\}";',
  "content: '{;';",
  'content: "/* } */";',
  'background: url(x}y.png);',
  "background: url('a;b}.png');",
  'top: 0;',
];

/** Wrappers a rule may sit in that neither gate nor ungate it. */
const WRAPS: Some<(rule: string) => string> = [
  (rule) => rule,
  (rule) => `@supports (display: grid) { ${rule} }`,
  (rule) => `@layer motion { ${rule} }`,
  (rule) => `@layer motion; ${rule}`,
  (rule) => `/* .card:hover { } */ ${rule}`,
  (rule) => `@media (min-width: 48rem) { ${rule} }`,
  (rule) => `@scope (.page) { ${rule} }`,
];

/** A sheet's hover stir placed under `query`, inside or outside the `outer` wrapper, or wrapped only, with no query. */
const placed = (
  rule: string,
  query: Option.Option<string>,
  wraps: { readonly inner: (rule: string) => string; readonly outer: (rule: string) => string },
  outside: boolean,
) =>
  Option.match(query, {
    onNone: () => wraps.outer(wraps.inner(rule)),
    onSome: (gate) => {
      if (outside) return `@media ${gate} { ${wraps.outer(wraps.inner(rule))} }`;
      return wraps.outer(`@media ${gate} { ${wraps.inner(rule)} }`);
    },
  });

/** One generated sheet: a hovered (or, in `unhovered`, an unhovered) stir, wrapped, under a gate, a near gate, or none. */
const generated = (next: () => number, unhovered: boolean): Written => {
  const pick = <A>(from: Some<A>): A => from[Math.floor(next() * from.length)] ?? from[0];
  const beside = Array.from({ length: Math.floor(next() * 3) }, () => pick(BESIDE));
  const body = [...beside.slice(0, 1), '--stir: 1;', ...beside.slice(1)].join(' ');
  const rule = pick([HOVERED, UNHOVERED][Number(unhovered)] ?? HOVERED)(body);
  const gate = next();
  const gated = gate < 0.4;
  const query = Option.liftPredicate(gate, (drawn) => drawn < 0.7).pipe(
    Option.map(() => pick([NEAR_GATES, GATES][Number(gated)] ?? NEAR_GATES)),
  );
  const wraps = { inner: pick(WRAPS), outer: pick(WRAPS) };
  const css = `.card { --stir: 0; } ${placed(rule, query, wraps, next() < 0.5)}`;
  return { css, gated: gated || unhovered };
};

describe('the stylesheet as rules', () => {
  plain('are read with their media, their selectors and parents, and their declarations', () => {
    const sheet = rules(
      '/* a */ .a { --x: 1 } @media (hover: hover) { .b, .c:hover { --y: 0 !important; } } .d { top: 0; & .e { left: 0 } right: 0 }',
    );
    expect(sheet.map((rule) => rule.header)).toEqual(['.a', '.b, .c:hover', '.d', '& .e', '.d']);
    expect(sheet.map((rule) => rule.chain.length)).toEqual([1, 1, 1, 2, 1]);
    expect(sheet.map((rule) => rule.media.length)).toEqual([0, 1, 0, 0, 0]);
    expect(sheet[1]?.declarations.map(({ important }) => important)).toEqual([true]);
  });

  plain(
    'read a brace, a semicolon, a colon or a comment in a quoted string as part of its value',
    () => {
      const sheet = rules(
        `.a { content: "}"; --x: 1 } .b[title='a, b'] { content: '{ /* a; b: c */ }' } .c { content: "\\}"; background: url(x}y.png) } .d { top: 0 }`,
      );
      expect(sheet.map((rule) => rule.header)).toEqual(['.a', ".b[title='a, b']", '.c', '.d']);
      expect(
        sheet.map((rule) => rule.declarations.map(({ declaration }) => nameOf(declaration))),
      ).toEqual([['content', '--x'], ['content'], ['content', 'background'], ['top']]);
    },
  );

  plain('split a selector list at its own commas, not inside :is()', () => {
    const [rule] = rules('.card:is(:hover, :focus-within), .b { --stir: 1 }');
    expect(rule?.chain[0]?.length).toBe(2);
    expect(hovers(rules('.b, .card:is(:hover, :focus-within) { --stir: 1 }')[0]?.chain ?? [])).toBe(
      true,
    );
  });

  plain('find each hover stir outside the fine-pointer query, however it is written', () => {
    const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      [`@media ${FINE_POINTER} { .card:hover { --stir: 1 } }`, []],
      ['.card:hover { --stir: 1 }', ['.card:hover']],
      ['.cards .card:HOVER { --stir: 1; }', ['.cards .card:HOVER']],
      ['@layer motion;\n.cards .card:hover { --stir: 1; }', ['.cards .card:hover']],
      ['.cards .card:hover { background: url(x}y.png); --stir: 1; }', ['.cards .card:hover']],
      ['.cards .card:hover { content: "\\}"; --stir: 1; }', ['.cards .card:hover']],
      ['.card { &:hover { --stir: 1; } }', ['&:hover']],
      ['.card:is(:hover, :focus-within) { --stir: 1 }', ['.card:is(:hover, :focus-within)']],
      ['.cards .card:hover { --stir: 1 }', ['.cards .card:hover']],
      ['@supports (display: grid) { .card:hover { --stir: 1 } }', ['.card:hover']],
      ['.cards .card:hover { content: "}"; --stir: 1; }', ['.cards .card:hover']],
      [
        `@media ${FINE_POINTER} { .card:hover { content: '{;'; --stir: 1 } } .card:focus:hover { --stir: 1 }`,
        ['.card:focus:hover'],
      ],
      ['@media (hover: hover) { .card:hover { --stir: 1 } }', ['.card:hover']],
      [`.card { @media ${FINE_POINTER} { &:hover { --stir: 1 } } }`, []],
      ['.card:not(:hover) { --stir: 1 }', []],
      ['@scope (.cards:hover) { .card { --stir: 1 } }', ['.card']],
      ['@scope (.cards:hover) { :scope .card { --stir: 1 } }', [':scope .card']],
      [`@media ${FINE_POINTER} { @scope (.cards:hover) { .card { --stir: 1 } } }`, []],
      ['@scope (.cards) to (.card:hover) { .card { --stir: 1 } }', []],
    ];
    expect(cases.map(([css]) => ungatedHovers(rules(css)))).toEqual(
      cases.map(([, found]) => [...found]),
    );
  });

  plain('refuse each generated ungated hover stir and pass each gated one', () => {
    const next = draws(7);
    const sheets = Array.from({ length: 160 }, (_, n) => generated(next, n % 5 === 4));
    expect(
      sheets.map(({ css }) => ({ css, ungated: ungatedHovers(rules(css)).length > 0 })),
    ).toEqual(sheets.map(({ css, gated }) => ({ css, ungated: !gated })));
    expect(new Set(sheets.map(({ gated }) => gated))).toEqual(new Set([true, false]));
  });

  plain('find an emblem eased with a spring', () => {
    const sheet = rules(
      ':root { --spring: cubic-bezier(0.34, 1.56, 0.64, 1); --calm: cubic-bezier(0.2, 0.7, 0.2, 1) } .emblem-land g { transition: rotate 900ms var(--spring) } .emblem-path g { transition: scale 600ms var(--calm), opacity 600ms var(--calm) } .emblem-taught .leaf { transition: scale 1s cubic-bezier(0.5, -0.4, 0.5, 1) } .emblem-remedies g { transition-timing-function: linear(0, 1.2, 1) } .x { .emblem-path & { transition: top 1s cubic-bezier(0, 0, 1, 2) } }',
    );
    expect(sprung(sheet)).toEqual([
      '.emblem-land g: cubic-bezier(0.34, 1.56, 0.64, 1)',
      '.emblem-taught .leaf: cubic-bezier(0.5, -0.4, 0.5, 1)',
      '.emblem-remedies g: linear(0, 1.2, 1)',
      '.emblem-path &: cubic-bezier(0, 0, 1, 2)',
    ]);
  });
});

describe('the motion in the stylesheet', () => {
  test('pointing stirs a card only where a fine pointer hovers, so a tap leaves no card stirred', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(given(sheet, '.card:hover', '--stir')).toEqual(
        expected(`@media ${FINE_POINTER} { .card:hover { --stir: 1 } }`, '.card:hover', '--stir'),
      );
      expect(ungatedHovers(sheet)).toEqual([]);
    }));

  test('each emblem stirs calmly, its easing never overshooting or springing back', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(sheet.filter((rule) => isEmblem(rule.chain)).length).toBeGreaterThan(0);
      expect(sprung(sheet)).toEqual([]);
    }));

  test('a card rests unstirred, and a focused or pressed card stirs as a pointed one does', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      expect(given(sheet, '.card', '--stir')).toEqual(
        expected(
          `.card { --stir: 0 } @media ${LESS_MOTION} { .card { --stir: 0 !important } }`,
          '.card',
          '--stir',
        ),
      );
      expect(given(sheet, '.card:active, .card:has(h3 a:focus-visible)', '--stir')).toEqual(
        expected(
          '.card:active, .card:has(h3 a:focus-visible) { --stir: 1 }',
          '.card:active, .card:has(h3 a:focus-visible)',
          '--stir',
        ),
      );
    }));

  test('for a reader who asks for less motion, the canvases are not shown', () =>
    Effect.gen(function* () {
      expect(given(yield* stylesheet, '.motion', 'display')).toEqual(
        expected(`@media ${LESS_MOTION} { .motion { display: none } }`, '.motion', 'display'),
      );
    }));

  test('a canvas is laid over its still and shown only once it has drawn', () =>
    Effect.gen(function* () {
      const sheet = yield* stylesheet;
      const motion = '.motion { position: absolute; pointer-events: none; opacity: 0 }';
      for (const property of ['position', 'pointer-events', 'opacity'])
        expect(given(sheet, '.motion', property)).toEqual(expected(motion, '.motion', property));
      expect(given(sheet, '.motion-on', 'opacity')).toEqual(
        expected('.motion-on { opacity: 1 }', '.motion-on', 'opacity'),
      );
    }));
});
