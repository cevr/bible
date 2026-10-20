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

import { type Fix, type Verses, wordsOf } from './census.js';

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
