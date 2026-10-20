/**
 * The layout mutations: a hymn's printed source (its fix's stanzas, else its
 * row's) changed in its layout alone, a line dropped or two swapped, a
 * stanza moved, the refrain left out, and written back as a row. The census
 * (`./census.ts`) must tell each one from its page.
 *
 * A mutation is named by a recipe (`dropline:2.3/4`: stanza 2's line 3 of
 * 4 dropped), and made in memory from the committed source, so no hymn text
 * is copied into a fixture. A recipe names the source's own counts: a source
 * that no longer has them refuses the recipe, never skips it.
 */

import { Result, Schema } from 'effect';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Order } from '../src/hymn.js';
import {
  bookOf,
  decidingOf,
  type Fix,
  formatProblems,
  layoutOf,
  outlinesOf,
  isEcho,
  type Outline,
  type Placement,
  placementOf,
  readAs,
  type PrintedLayout,
  type PrintedLine,
  type RefrainItem,
  refrainAfter,
  layoutLinesIn,
  layoutLinesOf,
  type Sources,
  spansOf,
  type StanzaCheck,
  stanzaCheckOf,
  type Verses,
  wordsOf,
} from './census.js';

/** A hymn's printed source as lines: each stanza's lines, in order, and the refrain's lines sung after each. */
export interface PrintedSource {
  readonly stanzas: ReadonlyArray<readonly string[]>;
  readonly refrain: readonly string[];
}

const linesOf = (text: string) => text.split('\n').filter((line) => line.trim() !== '');

/**
 * The printed source of a hymn: its fix's stanzas and its refrain lines that
 * every stanza sings (a varying part left out), else its row's stanzas by id
 * and its refrain (id -1, then -2).
 */
export const printedSourceOf = (row: Verses, fix: Fix | undefined): PrintedSource =>
  fix !== undefined
    ? {
        stanzas: fix.stanzas.map((lines) => lines.map((line) => line.text)),
        refrain: (fix.refrain?.lines ?? []).flatMap((item) =>
          'varies' in item ? [] : [item.text],
        ),
      }
    : {
        stanzas: row
          .filter((verse) => verse.id >= 0)
          .toSorted((a, b) => a.id - b.id)
          .map((verse) => linesOf(verse.text)),
        refrain: row
          .filter((verse) => verse.id < 0)
          .toSorted((a, b) => b.id - a.id)
          .flatMap((verse) => linesOf(verse.text)),
      };

/** A printed source written back as a row: each stanza by its index, the refrain as -1. */
export const rowOfSource = (source: PrintedSource): Verses => [
  ...source.stanzas.map((lines, id) => ({ id, text: lines.join('\n') })),
  ...(source.refrain.length > 0 ? [{ id: -1, text: source.refrain.join('\n') }] : []),
];

const sameWords = (a: readonly string[], b: readonly string[]) =>
  wordsOf(a.join('\n')).join(' ') === wordsOf(b.join('\n')).join(' ');

/**
 * A recipe applied to a printed source: the mutant, or why the source does
 * not have what the recipe names.
 *
 * - `dropline:<s>.<l>/<n>`: stanza s (of n lines) without its line l;
 * - `swaplines:<s>.<l>/<n>`: stanza s (of n lines) with lines l and l + 1 swapped (their words differ);
 * - `swap:<i>-<j>`: stanzas i and j swapped (their words differ);
 * - `norefrain`: the refrain left out.
 */
export const applyRecipe = (
  source: PrintedSource,
  recipe: string,
): Result.Result<PrintedSource, string> => {
  const stanzas = source.stanzas.map((lines) => [...lines]);
  if (recipe === 'norefrain')
    return source.refrain.length === 0
      ? Result.fail('the source has no refrain')
      : Result.succeed({ stanzas, refrain: [] });
  const swap = /^swap:(\d+)-(\d+)$/.exec(recipe);
  if (swap !== null) {
    const [i, j] = [Number(swap[1]) - 1, Number(swap[2]) - 1];
    const [a, b] = [stanzas[i], stanzas[j]];
    if (a === undefined || b === undefined) return Result.fail(`no stanza ${i + 1} or ${j + 1}`);
    if (sameWords(a, b)) return Result.fail(`stanzas ${i + 1} and ${j + 1} sing the same words`);
    stanzas[i] = b;
    stanzas[j] = a;
    return Result.succeed({ stanzas, refrain: source.refrain });
  }
  const line = /^(dropline|swaplines):(\d+)\.(\d+)\/(\d+)$/.exec(recipe);
  if (line === null) return Result.fail(`no recipe ${recipe}`);
  const [s, l, count] = [Number(line[2]) - 1, Number(line[3]) - 1, Number(line[4])];
  const lines = stanzas[s];
  if (lines === undefined) return Result.fail(`no stanza ${s + 1}`);
  if (lines.length !== count)
    return Result.fail(`stanza ${s + 1} has ${lines.length} lines, the recipe ${count}`);
  if (line[1] === 'dropline') {
    if (count < 2 || l >= count) return Result.fail(`stanza ${s + 1} has no line ${l + 1} to drop`);
    lines.splice(l, 1);
    return Result.succeed({ stanzas, refrain: source.refrain });
  }
  const [a, b] = [lines[l], lines[l + 1]];
  if (a === undefined || b === undefined)
    return Result.fail(`stanza ${s + 1} has no lines ${l + 1} and ${l + 2}`);
  if (sameWords([a], [b])) return Result.fail(`lines ${l + 1} and ${l + 2} sing the same words`);
  lines[l] = b;
  lines[l + 1] = a;
  return Result.succeed({ stanzas, refrain: source.refrain });
};

// ----------------------------------------------------------------------------
// The generated property: every layout mutation of a printed layout
// ----------------------------------------------------------------------------

/** The layout properties a row can get wrong (the README's census section names each). */
export const PROPERTIES = [
  'stanza count',
  'stanza order',
  'stanza split',
  'line presence',
  'line order',
  'line break',
  'indent',
  'refrain presence',
  'refrain placement',
  'refrain varies',
  'unnumbered rows',
] as const;
export type Property = (typeof PROPERTIES)[number];

/**
 * One mutation of a printed layout: its property, its name (`dropline:2.3`,
 * stanza 2's line 3 dropped), the layout it makes, the stanzas whose words
 * or lines it changes (1-based; `all` when it changes the refrain or the
 * stanzas' count), and whether it moves no word (`breaks`: only where lines
 * break or open, so the rows stand where they stood).
 */
export interface LayoutMutant {
  readonly property: Property;
  readonly name: string;
  readonly layout: PrintedLayout;
  readonly touches: readonly number[] | 'all';
  readonly breaks: boolean;
}

const sameLine = (a: PrintedLine, b: PrintedLine) => a.words.join(' ') === b.words.join(' ');
const sameLines = (a: readonly PrintedLine[], b: readonly PrintedLine[]) =>
  a.flatMap((line) => line.words).join(' ') === b.flatMap((line) => line.words).join(' ');

/** A line's words, each with its marks. */
type Run = Pick<PrintedLine, 'words' | 'sentences' | 'capitals'>;

/** A line's words from `from` to `to` (as `Array.slice`), each with its marks. */
const cut = (line: Run, from: number, to?: number): Run => ({
  words: line.words.slice(from, to),
  sentences: line.sentences.slice(from, to),
  capitals: line.capitals.slice(from, to),
});

/** Two runs of words as one, each with its marks. */
const glue = (a: Run, b: Run): Run => ({
  words: [...a.words, ...b.words],
  sentences: [...a.sentences, ...b.sentences],
  capitals: [...a.capitals, ...b.capitals],
});

/** A unit's line mutations: each as its property, its name's tail, its lines, and whether it moves no word. */
const lineMutations = function* (lines: readonly PrintedLine[]) {
  const at = (k: number) => lines[k] ?? { words: [], sentences: [], capitals: [], indent: false };
  const without = (k: number) => lines.filter((_, j) => j !== k);
  for (let k = 0; k < lines.length; k++) {
    const line = at(k);
    yield {
      property: 'line presence',
      name: `dropline:${k + 1}`,
      lines: without(k),
      breaks: false,
    } as const;
    yield {
      property: 'line presence',
      name: `repeatline:${k + 1}`,
      lines: lines.toSpliced(k + 1, 0, line),
      breaks: false,
    } as const;
    yield {
      property: 'indent',
      name: `indent:${k + 1}`,
      lines: lines.toSpliced(k, 1, { ...line, indent: true }),
      breaks: true,
    } as const;
    if (line.words.length >= 2) {
      const m = Math.floor(line.words.length / 2);
      const halves = [
        { ...cut(line, 0, m), indent: line.indent },
        { ...cut(line, m), indent: false },
      ];
      yield {
        property: 'line break',
        name: `split:${k + 1}`,
        lines: lines.toSpliced(k, 1, ...halves),
        breaks: true,
      } as const;
    }
    if (k + 1 >= lines.length) continue;
    const next = at(k + 1);
    if (!sameLine(line, next))
      yield {
        property: 'line order',
        name: `swaplines:${k + 1}`,
        lines: lines.toSpliced(k, 2, next, line),
        breaks: false,
      } as const;
    yield {
      property: 'line break',
      name: `join:${k + 1}`,
      lines: lines.toSpliced(k, 2, { ...glue(line, next), indent: line.indent }),
      breaks: true,
    } as const;
    if (line.words.length >= 2)
      yield {
        property: 'line break',
        name: `movedown:${k + 1}`,
        lines: lines.toSpliced(
          k,
          2,
          { ...line, ...cut(line, 0, -1) },
          { ...next, ...glue(cut(line, -1), next) },
        ),
        breaks: true,
      } as const;
    if (next.words.length >= 2)
      yield {
        property: 'line break',
        name: `moveup:${k + 1}`,
        lines: lines.toSpliced(
          k,
          2,
          { ...line, ...glue(line, cut(next, 0, 1)) },
          { ...next, ...cut(next, 1) },
        ),
        breaks: true,
      } as const;
  }
  const [first, last] = [at(0), at(lines.length - 1)];
  if (lines.length >= 3 && !sameLine(first, last))
    yield {
      property: 'line order',
      name: 'swapends',
      lines: lines.toSpliced(0, 1, last).toSpliced(lines.length - 1, 1, first),
      breaks: false,
    } as const;
};

/** The refrain's runs of lines every stanza sings (its items between the parts that vary), each as its first item's place and its lines. */
const refrainRuns = (refrain: readonly RefrainItem[]) => {
  const runs: Array<{ at: number; lines: PrintedLine[] }> = [];
  for (const [k, item] of refrain.entries()) {
    if ('varies' in item) continue;
    const last = runs.at(-1);
    if (last !== undefined && last.at + last.lines.length === k) last.lines.push(item);
    else runs.push({ at: k, lines: [item] });
  }
  return runs;
};

const ORDERS = Order.literals;

/**
 * Every mutation of Decided 3 of one hymn's printed layout, against its
 * shape readings (`outlines`, whose rows no echo makes the words of an extra
 * row to drop).
 */
export const mutantsOf = function* (
  layout: PrintedLayout,
  outlines: readonly Outline[],
): Generator<LayoutMutant> {
  yield* stanzaMutants(layout);
  yield* stanzaLineMutants(layout);
  yield* refrainLineMutants(layout);
  yield* refrainMutants(layout);
  yield* extraMutants(layout, outlines);
};

/** A layout with other stanzas. */
const withStanzas = (
  layout: PrintedLayout,
  stanzas: ReadonlyArray<readonly PrintedLine[]>,
): PrintedLayout => ({
  ...layout,
  stanzas,
});

/** Stanza count, order and split: each stanza dropped, repeated, swapped with each other, split at each line, joined to the next, its boundary moved. */
const stanzaMutants = function* (layout: PrintedLayout): Generator<LayoutMutant> {
  const stanzas = layout.stanzas;
  for (let i = 0; i < stanzas.length; i++) {
    const stanza = stanzas[i] ?? [];
    yield {
      property: 'stanza count',
      name: `dropstanza:${i + 1}`,
      layout: withStanzas(layout, stanzas.toSpliced(i, 1)),
      touches: 'all',
      breaks: false,
    };
    yield {
      property: 'stanza count',
      name: `repeatstanza:${i + 1}`,
      layout: withStanzas(layout, stanzas.toSpliced(i + 1, 0, stanza)),
      touches: 'all',
      breaks: false,
    };
    for (let j = i + 1; j < stanzas.length; j++)
      if (!sameLines(stanza, stanzas[j] ?? []))
        yield {
          property: 'stanza order',
          name: `swap:${i + 1}-${j + 1}`,
          layout: withStanzas(
            layout,
            stanzas.toSpliced(i, 1, stanzas[j] ?? []).toSpliced(j, 1, stanza),
          ),
          touches: [i + 1, j + 1],
          breaks: false,
        };
    for (let b = 1; b < stanza.length; b++)
      yield {
        property: 'stanza split',
        name: `splitstanza:${i + 1}.${b}`,
        layout: withStanzas(layout, stanzas.toSpliced(i, 1, stanza.slice(0, b), stanza.slice(b))),
        touches: 'all',
        breaks: false,
      };
    yield* boundaryMutants(layout, i);
  }
};

/** Stanza `i` (0-based) joined to the next, and the boundary between them moved a line either way. */
const boundaryMutants = function* (layout: PrintedLayout, i: number): Generator<LayoutMutant> {
  const stanzas = layout.stanzas;
  const [stanza, next] = [stanzas[i] ?? [], stanzas[i + 1]];
  if (next === undefined) return;
  yield {
    property: 'stanza split',
    name: `joinstanzas:${i + 1}`,
    layout: withStanzas(layout, stanzas.toSpliced(i, 2, [...stanza, ...next])),
    touches: 'all',
    breaks: false,
  };
  if (stanza.length >= 2)
    yield {
      property: 'stanza split',
      name: `boundaryup:${i + 1}`,
      layout: withStanzas(
        layout,
        stanzas.toSpliced(i, 2, stanza.slice(0, -1), [...stanza.slice(-1), ...next]),
      ),
      touches: [i + 1, i + 2],
      breaks: false,
    };
  if (next.length >= 2)
    yield {
      property: 'stanza split',
      name: `boundarydown:${i + 1}`,
      layout: withStanzas(
        layout,
        stanzas.toSpliced(i, 2, [...stanza, ...next.slice(0, 1)], next.slice(1)),
      ),
      touches: [i + 1, i + 2],
      breaks: false,
    };
};

/** A unit's line mutation named in the hymn: `dropline:3` of stanza 2 is `dropline:2.3`, `swapends` of the refrain `swapends:refrain.1`. */
const within = (name: string, unit: string) =>
  name.includes(':') ? name.replace(':', `:${unit}.`) : `${name}:${unit}`;

/** Each stanza's line mutations, and a line of the stanza after it (before it, for the last) put in. */
const stanzaLineMutants = function* (layout: PrintedLayout): Generator<LayoutMutant> {
  const stanzas = layout.stanzas;
  for (let i = 0; i < stanzas.length; i++) {
    const stanza = stanzas[i] ?? [];
    for (const one of lineMutations(stanza))
      yield {
        property: one.property,
        name: within(one.name, `${i + 1}`),
        layout: withStanzas(layout, stanzas.toSpliced(i, 1, one.lines)),
        touches: [i + 1],
        breaks: one.breaks,
      };
    const other = stanzas[i + 1 < stanzas.length ? i + 1 : i - 1] ?? [];
    for (const [k, line] of other.entries())
      if (!stanza.some((mine) => sameLine(mine, line)))
        yield {
          property: 'line presence',
          name: `insertline:${i + 1}.${k + 1}`,
          layout: withStanzas(layout, stanzas.toSpliced(i, 1, stanza.toSpliced(k, 0, line))),
          touches: [i + 1],
          breaks: false,
        };
  }
};

/** The line mutations of the refrain's lines every stanza sings, and of each part that varies; each part dropped, or the parts sung as one. */
const refrainLineMutants = function* (layout: PrintedLayout): Generator<LayoutMutant> {
  const items = layout.refrain ?? [];
  for (const run of refrainRuns(items))
    for (const one of lineMutations(run.lines))
      yield {
        property: one.property,
        name: within(one.name, `refrain.${run.at + 1}`),
        layout: { ...layout, refrain: items.toSpliced(run.at, run.lines.length, ...one.lines) },
        touches: 'all',
        breaks: one.breaks,
      };
  for (const [k, item] of items.entries()) {
    if (!('varies' in item)) continue;
    for (const [p, part] of item.varies.entries())
      for (const one of lineMutations(part.lines))
        yield {
          property: one.property,
          name: within(one.name, `varies.${k + 1}.${p + 1}`),
          layout: {
            ...layout,
            refrain: items.toSpliced(k, 1, {
              varies: item.varies.toSpliced(p, 1, { ...part, lines: one.lines }),
            }),
          },
          touches: 'all',
          breaks: one.breaks,
        };
    yield {
      property: 'refrain varies',
      name: `dropvaries:${k + 1}`,
      layout: { ...layout, refrain: items.toSpliced(k, 1) },
      touches: 'all',
      breaks: false,
    };
    yield {
      property: 'refrain varies',
      name: `unvary:${k + 1}`,
      layout: {
        ...layout,
        refrain: items.toSpliced(k, 1, ...item.varies.flatMap((part) => part.lines)),
      },
      touches: 'all',
      breaks: false,
    };
  }
};

/** The refrain dropped, sung in each other order, or put inside one stanza only; with none, a stanza's last line made one. */
const refrainMutants = function* (layout: PrintedLayout): Generator<LayoutMutant> {
  const stanzas = layout.stanzas;
  if (layout.refrain === undefined) {
    for (const [i, stanza] of stanzas.entries())
      if (stanza.length >= 2)
        yield {
          property: 'refrain presence',
          name: `makerefrain:${i + 1}`,
          layout: {
            ...layout,
            refrain: stanza.slice(-1),
            stanzas: stanzas.toSpliced(i, 1, stanza.slice(0, -1)),
          },
          touches: 'all',
          breaks: false,
        };
    return;
  }
  yield {
    property: 'refrain presence',
    name: 'norefrain',
    layout: { ...layout, refrain: undefined },
    touches: 'all',
    breaks: false,
  };
  const order = layout.order ?? 'after-each';
  for (const other of ORDERS.filter((one) => one !== order))
    yield {
      property: 'refrain placement',
      name: `order:${other}`,
      layout: { ...layout, order: other },
      touches: 'all',
      breaks: false,
    };
  for (const [i, stanza] of stanzas.entries())
    yield {
      property: 'refrain placement',
      name: `inside:${i + 1}`,
      layout: {
        ...layout,
        refrain: undefined,
        stanzas: stanzas.toSpliced(i, 1, [...stanza, ...refrainAfter(layout, i + 1)]),
      },
      touches: 'all',
      breaks: false,
    };
};

/** The words of each extra row that is no echo, dropped wherever the source sings them. */
const extraMutants = function* (
  layout: PrintedLayout,
  outlines: readonly Outline[],
): Generator<LayoutMutant> {
  for (const outline of outlines)
    for (const [e, extra] of outline.extra.entries()) {
      const without = isEcho(extra) ? layout : withoutRow(layout, extra);
      // A row the source sings nowhere drops nothing: no mutant.
      if (without !== layout)
        yield {
          property: 'unnumbered rows',
          name: `dropextra:${outline.reader}.${e + 1}`,
          layout: without,
          touches: 'all',
          breaks: false,
        };
    }
};

/** A layout with every place a row stands dropped: in each stanza's own lines, and in the refrain's. */
const withoutRow = (layout: PrintedLayout, row: Outline['extra'][number]): PrintedLayout => {
  const drop = (lines: readonly PrintedLine[]) => {
    const words = lines.flatMap((line) => line.words);
    const gone = new Set<number>();
    for (const span of spansOf(words, row)) for (let k = span.start; k < span.end; k++) gone.add(k);
    if (gone.size === 0) return lines;
    let at = 0;
    return lines.flatMap((line) => {
      const keep = (_: string | boolean, k: number) => !gone.has(at + k);
      const kept = {
        ...line,
        words: line.words.filter(keep),
        sentences: line.sentences.filter(keep),
        capitals: line.capitals.filter(keep),
      };
      at += line.words.length;
      return kept.words.length === 0 ? [] : [kept];
    });
  };
  const refrain = layout.refrain;
  let dropped = false;
  const dropping = (lines: readonly PrintedLine[]) => {
    const kept = drop(lines);
    dropped ||= kept !== lines;
    return kept;
  };
  const without: PrintedLayout = {
    ...layout,
    stanzas: layout.stanzas.map(dropping),
    refrain:
      refrain === undefined
        ? undefined
        : refrainRuns(refrain).reduceRight<readonly RefrainItem[]>(
            (items, run) => items.toSpliced(run.at, run.lines.length, ...dropping(run.lines)),
            refrain,
          ),
  };
  // The layout itself when the source sings the row nowhere.
  return dropped ? without : layout;
};

/** What one hymn's mutants come to, by property: how many, and the names of those no layout line tells apart. */
export interface Reach {
  readonly mutants: number;
  readonly unreached: readonly string[];
}

/**
 * Every mutant of one hymn held to its shape readings by the census's own
 * checks (`layoutLinesOf`, `formatProblems`): a mutant is reached when it
 * prints a layout line the hymn as committed does not. The hymn as committed
 * is checked once; a mutant checks again only the stanzas it touches, and a
 * mutant that moves no word places no row again. `book` is the words the
 * book capitalises inside a line (`capitalsOf`).
 */
export const reachOf = (
  n: number,
  layout: PrintedLayout,
  outlines: readonly Outline[],
  borrower: boolean,
  book: ReadonlySet<string>,
): ReadonlyMap<Property, Reach> => {
  const controls = outlines.map((outline) => {
    const what = `${n} shape (${outline.reader})`;
    const read = readAs(outline, layout);
    const checks = new Map<number, StanzaCheck>();
    const placements = new Map<number, Placement>();
    for (let i = 1; i <= Math.min(read.stanzas.length, layout.stanzas.length); i++) {
      const placement = placementOf(what, read, layout, i);
      placements.set(i, placement);
      checks.set(i, stanzaCheckOf(what, read, layout, i, book, placement));
    }
    const lines = new Set(layoutLinesOf(n, outline, layout, borrower, book, (i) => checks.get(i)));
    return { outline, read, what, checks, placements, lines };
  });
  const format = new Set(formatProblems(n, layout));
  const reach = new Map<Property, { mutants: number; unreached: string[] }>();
  for (const mutant of mutantsOf(layout, outlines)) {
    const one = reach.get(mutant.property) ?? { mutants: 0, unreached: [] };
    reach.set(mutant.property, one);
    one.mutants += 1;
    const touched = (i: number) => mutant.touches === 'all' || mutant.touches.includes(i);
    const reached =
      formatProblems(n, mutant.layout).some((line) => !format.has(line)) ||
      controls.some((control) => {
        const lines = layoutLinesIn(n, control.outline, mutant.layout, borrower, book, (i) => {
          if (mutant.layout.stanzas.length !== layout.stanzas.length) return undefined;
          if (readAs(control.outline, mutant.layout) !== control.read) return undefined;
          if (!touched(i)) return control.checks.get(i);
          const placement = control.placements.get(i);
          return mutant.breaks && placement !== undefined
            ? stanzaCheckOf(control.what, control.read, mutant.layout, i, book, placement)
            : undefined;
        });
        // The first line the hymn as committed does not print is enough.
        for (const line of lines) if (!control.lines.has(line)) return true;
        return false;
      });
    if (!reached) one.unreached.push(mutant.name);
  }
  return reach;
};

/**
 * The generated property over the book: every hymn with a deciding page, its
 * mutants held to its shape readings (`reachOf`). Per property, how many
 * mutants and how many no layout line tells apart; the hymns with no shape
 * reading; how many unreached mutants the committed lists hold, the page's
 * (`unreachable`: no page tells them apart) and the check's (`gaps`: the
 * page does, the check does not); and each mutant on the wrong side of
 * them (`<n> <name>`): unreached but on neither list, or on one but reached.
 */
export interface Domain {
  readonly hymns: number;
  readonly properties: ReadonlyMap<
    Property,
    { readonly mutants: number; readonly unreached: number }
  >;
  readonly lists: { readonly unreachable: number; readonly gaps: number };
  readonly unread: readonly number[];
  readonly unlisted: readonly string[];
  readonly reached: readonly string[];
}

export const domainOf = (sources: Sources): Domain => {
  const properties = new Map<Property, { mutants: number; unreached: number }>(
    PROPERTIES.map((property) => [property, { mutants: 0, unreached: 0 }]),
  );
  const [unread, unlisted, reached]: [number[], string[], string[]] = [[], [], []];
  const lists = { unreachable: 0, gaps: 0 };
  const hymns = [...decidingOf(sources.inventory)]
    .filter(([, deciding]) => deciding.source !== 'none')
    .map(([n]) => n)
    .toSorted((a, b) => a - b);
  for (const n of hymns) {
    const { outlines, borrower } = outlinesOf(sources, n);
    if (outlines.length === 0) {
      unread.push(n);
      continue;
    }
    const layout = layoutOf(sources.rows.get(n) ?? [], sources.fixes.get(n), sources.orders.get(n));
    const rulings = sources.rulings.get(n) ?? [];
    const unreachable = rulings.flatMap((ruling) => ruling.unreachable ?? []);
    const gaps = rulings.flatMap((ruling) => ruling.gaps ?? []);
    const listed = new Set([...unreachable, ...gaps]);
    lists.unreachable += unreachable.length;
    lists.gaps += gaps.length;
    // A mutant is on one list once: the page tells it apart or it does not.
    reached.push(
      ...[...unreachable, ...gaps]
        .filter((name, i, all) => all.indexOf(name) !== i)
        .map((name) => `${n} ${name} (listed twice)`),
    );
    const missed = new Set<string>();
    for (const [property, reach] of reachOf(n, layout, outlines, borrower, bookOf(sources, n))) {
      const total = properties.get(property);
      if (total !== undefined) {
        total.mutants += reach.mutants;
        total.unreached += reach.unreached.length;
      }
      for (const name of reach.unreached) missed.add(name);
    }
    unlisted.push(...[...missed].filter((name) => !listed.has(name)).map((name) => `${n} ${name}`));
    reached.push(...[...listed].filter((name) => !missed.has(name)).map((name) => `${n} ${name}`));
  }
  return { hymns: hymns.length, properties, lists, unread, unlisted, reached };
};

const Mutant = Schema.Struct({ number: Schema.Int, mode: Schema.String, from: Schema.String });
export type Mutant = typeof Mutant.Type;

const MutantsFile = Schema.Struct({ print: Schema.String, mutants: Schema.Array(Mutant) });

/**
 * The committed layout fixtures (`data/layout-mutants.json`): recipes, never
 * text. Read at once, so a test can name a case for each.
 */
export const layoutMutants = (): readonly Mutant[] =>
  Schema.decodeSync(Schema.fromJsonString(MutantsFile))(
    readFileSync(path.resolve(import.meta.dir, '../data/layout-mutants.json'), 'utf8'),
  ).mutants;
