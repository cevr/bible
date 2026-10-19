/**
 * Text fidelity, the class property: every hymn 1-695, compiled fresh from
 * its hymnal.db row and its MIDI file (the source the compile script builds,
 * compiled in `fidelity-worker.ts` off this thread), sings exactly its printed text in the order the hymnal sings it, line for
 * line: nothing missing, nothing extra, nothing moved. A line is compared as
 * the golden compares a syllable: case and punctuation ignored (each word's
 * letters and digits, the words in order).
 *
 * The oracle builds the expected lines from the sources alone, never from the
 * compiler or `sung`: the row's stanzas by id and its one negative-id
 * refrain; the refrain's place from `data/fixes/refrains.json`, read off each
 * refrain hymn's page; and, for a row hymnal.db holds rewritten from its
 * page (each hymn with a `data/fixes/NNN.json`: the census's `fixed` hymns
 * and the seven fixes before it), that printed source in place of the row.
 * Where a refrain is sung has no default: a refrain hymn `refrains.json`
 * does not list, or a listed hymn with no refrain, fails. The mutant cases
 * below hold the property to the defects it exists to catch.
 */

import { HymnalService, HymnId } from '@bible/core/hymnal';
import { layerHymnalBun } from '@bible/core/hymnal/bun';
import { BunWorker } from '@effect/platform-bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import {
  Array as Arr,
  Cause,
  ConfigProvider,
  Deferred,
  Effect,
  FileSystem,
  Layer,
  Result,
  Schema,
} from 'effect';
import * as Worker from 'effect/workers/Worker';
import { describe, expect, it } from 'effect-bun-test';

import { type Hymn, type Part, sung } from './hymn.js';

const data = (file: string) => new URL(`../data/${file}`, import.meta.url).pathname;

const layer = Layer.merge(
  layerHymnalBun.pipe(
    Layer.provide(BunServices.layer),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: { HOME: '/', HYMNAL_DB_PATH: data('../../core/data/hymnal.db') },
        }),
      ),
    ),
  ),
  BunServices.layer,
);

// ----------------------------------------------------------------------------
// The oracle: the printed text, in the order the hymnal sings it
// ----------------------------------------------------------------------------

/** Where a refrain is sung, as its page prints it. */
const Order = Schema.Literals([
  'after-each',
  'first-and-after-each',
  'before-each',
  'first-and-last',
  'after-last',
]);
type Order = typeof Order.Type;

/** A hymn's printed text: its stanzas' lines, and its refrain's place and its lines after stanza n (0-based). */
interface Printed {
  readonly stanzas: ReadonlyArray<ReadonlyArray<string>>;
  readonly refrain?: { readonly order: Order; readonly after: (n: number) => readonly string[] };
}

const linesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** A line as compared: lower case, each word's letters and digits, the words joined by one space. */
const words = (line: string) =>
  line
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .join(' ');

/** The printed lines in sung order: each stanza, with the refrain where the hymnal sings it. */
const expected = ({ stanzas, refrain }: Printed): string[] => {
  if (refrain === undefined) return stanzas.flat();
  const last = stanzas.length - 1;
  const first = refrain.after(0);
  switch (refrain.order) {
    case 'after-each':
      return stanzas.flatMap((lines, n) => [...lines, ...refrain.after(n)]);
    case 'first-and-after-each':
      return [...first, ...stanzas.flatMap((lines, n) => [...lines, ...refrain.after(n)])];
    case 'before-each':
      return stanzas.flatMap((lines, n) => [...refrain.after(n), ...lines]);
    case 'first-and-last':
      return [...first, ...stanzas.flat(), ...refrain.after(last)];
    case 'after-last':
      return [...stanzas.flat(), ...refrain.after(last)];
  }
};

const PrintedLines = Schema.Array(Schema.Struct({ text: Schema.String }));
const PrintedRow = Schema.fromJsonString(
  Schema.Struct({
    number: Schema.Int,
    stanzas: Schema.Array(PrintedLines),
    refrain: Schema.optionalKey(
      Schema.Struct({
        lines: Schema.Array(
          Schema.Union([
            Schema.Struct({ text: Schema.String }),
            Schema.Struct({
              varies: Schema.Array(
                Schema.Struct({ after: Schema.Array(Schema.Int), lines: PrintedLines }),
              ),
            }),
          ]),
        ),
      }),
    ),
  }),
);

const Refrains = Schema.fromJsonString(
  Schema.Struct({ hymns: Schema.Array(Schema.Struct({ number: Schema.Int, order: Order })) }),
);

/**
 * A printed source (`data/fixes/NNN.json`): its stanzas, and its refrain as
 * printed after each stanza, a part printed once for each stanza (`varies`)
 * in place. A refrain that varies is sung after each stanza, its own part in
 * it, and the census does not list it (the row holds no refrain); one that
 * does not vary is sung where the census places it, and has no default.
 */
const fromPrint = (text: string, order: Order | undefined) =>
  Effect.map(
    Schema.decodeEffect(PrintedRow)(text),
    ({ stanzas, refrain }): Result.Result<Printed, string> => {
      const texts = (lines: ReadonlyArray<{ readonly text: string }>) => lines.map((l) => l.text);
      const printed = { stanzas: stanzas.map(texts) };
      if (refrain === undefined)
        return order === undefined
          ? Result.succeed(printed)
          : Result.fail(`refrains.json places a refrain (${order}) the print does not have`);
      const after = (n: number) =>
        refrain.lines.flatMap((item) =>
          'varies' in item
            ? texts(item.varies.find((part) => part.after.includes(n + 1))?.lines ?? [])
            : [item.text],
        );
      const varies = refrain.lines.some((item) => 'varies' in item);
      if (varies)
        return order === undefined
          ? Result.succeed({ ...printed, refrain: { order: 'after-each', after } })
          : Result.fail(`refrains.json places a refrain (${order}) printed once for each stanza`);
      return order === undefined
        ? Result.fail('its refrain has no place in refrains.json')
        : Result.succeed({ ...printed, refrain: { order, after } });
    },
  );

/**
 * A hymnal.db row: its stanzas by id, and its one negative-id refrain at the
 * place the census lists. A refrain the census does not place, or a place
 * listed for a hymn with no refrain, is a failure: there is no default.
 */
const fromRow = (
  verses: ReadonlyArray<{ readonly id: number; readonly text: string }>,
  order: Order | undefined,
): Result.Result<Printed, string> => {
  const stanzas = verses
    .filter((verse) => verse.id >= 0)
    .toSorted((a, b) => a.id - b.id)
    .map((verse) => linesOf(verse.text));
  const refrains = verses.filter((verse) => verse.id < 0);
  const chorus = refrains.length === 1 ? refrains[0] : undefined;
  if (chorus === undefined) {
    return order === undefined
      ? Result.succeed({ stanzas })
      : Result.fail(`refrains.json places a refrain (${order}) the row does not have`);
  }
  if (order === undefined) return Result.fail('its refrain has no place in refrains.json');
  const lines = linesOf(chorus.text);
  return Result.succeed({ stanzas, refrain: { order, after: () => lines } });
};

// ----------------------------------------------------------------------------
// Every hymn, compiled fresh once for this file
// ----------------------------------------------------------------------------

interface Compiled {
  readonly number: number;
  /** The printed text in sung order, or why the oracle cannot build it. */
  readonly printed: Result.Result<Printed, string>;
  /** The compiled hymn, or why it failed. */
  readonly hymn: Result.Result<Hymn, string>;
}

/** Where each listed refrain is sung, read by the oracle's own schema. */
const orders = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const text = yield* (yield* FileSystem.FileSystem).readFileString(
        data('fixes/refrains.json'),
      );
      const listed = yield* Schema.decodeEffect(Refrains)(text);
      return { printed: new Map(listed.hymns.map((hymn) => [hymn.number, hymn.order])) };
    }),
  ),
);

const ALL = Arr.range(1, 695);

/** One hymn compiled, or why it failed: what `fidelity-worker.ts` sends. */
type Done =
  | { readonly number: number; readonly hymn: Hymn }
  | { readonly number: number; readonly failure: string };

/** The workers that compile the hymns: a few, so the compiles share the cores. */
const WORKERS = 4;

const workers = BunWorker.layer(
  // oxlint-disable-next-line effect/noGlobals -- the host's Worker, spawned only through Effect's BunWorker
  () => new globalThis.Worker(new URL('./fidelity-worker.ts', import.meta.url)),
);

/**
 * Worker k compiles `numbers` and settles each one's place in `waiting` as
 * it is sent, then closes; a worker that fails settles every place it has
 * left with why.
 */
const compileIn = (
  k: number,
  numbers: readonly number[],
  waiting: ReadonlyMap<number, Deferred.Deferred<Hymn, string>>,
) =>
  Effect.gen(function* () {
    const worker = yield* (yield* Worker.WorkerPlatform).spawn<Done, readonly number[]>(k);
    const over = yield* Deferred.make<void>();
    const settled = new Set<number>();
    const settle = (done: Done) =>
      Effect.gen(function* () {
        const place = waiting.get(done.number);
        if (place !== undefined)
          yield* 'hymn' in done
            ? Deferred.succeed(place, done.hymn)
            : Deferred.fail(place, done.failure);
        settled.add(done.number);
        if (settled.size === numbers.length) yield* Deferred.succeed(over, undefined);
      });
    yield* worker.send(numbers);
    yield* Effect.raceFirst(worker.run(settle), Deferred.await(over));
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.forEach(
        numbers,
        (n) => {
          const place = waiting.get(n);
          return place === undefined
            ? Effect.void
            : Deferred.fail(place, `worker ${k} stopped: ${Cause.pretty(cause)}`);
        },
        { discard: true },
      ),
    ),
  );

/**
 * Each hymn's compile, as a place `fidelity-worker.ts` settles. The workers
 * start on the first hymn asked for, in a runtime of their own (a test's
 * clock is not theirs); worker k takes every WORKERS-th hymn from the k-th,
 * so each chunk's hymns are done early.
 */
const compiles = Effect.runSync(
  Effect.cached(
    Effect.sync(() => {
      const waiting = new Map(ALL.map((n) => [n, Deferred.makeUnsafe<Hymn, string>()]));
      Effect.runFork(
        Effect.forEach(
          Arr.range(0, WORKERS - 1),
          (k) =>
            compileIn(
              k,
              ALL.filter((_, i) => i % WORKERS === k),
              waiting,
            ),
          { concurrency: WORKERS, discard: true },
        ).pipe(Effect.provide(workers)),
      );
      return waiting;
    }),
  ),
);

/** Each hymn compiled so far: the chunks of the property fill it, the mutant cases read it. */
const memo = new Map<number, Compiled>();

const compileOne = (n: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { printed: order } = yield* orders;
    const row = yield* (yield* HymnalService).getHymn(HymnId.make(n));
    const fix = data(`fixes/${String(n).padStart(3, '0')}.json`);
    const printed = (yield* fs.exists(fix))
      ? yield* fromPrint(yield* fs.readFileString(fix), order.get(n))
      : fromRow(row.verses, order.get(n));
    const place = (yield* compiles).get(n);
    if (place === undefined) return yield* Effect.die(`no worker compiles hymn ${n}`);
    const hymn = yield* Effect.result(Deferred.await(place));
    const one: Compiled = { number: n, printed, hymn };
    memo.set(n, one);
    return one;
  });

/** The hymns, compiled fresh (once each for this file). */
const compiledOf = (numbers: readonly number[]) =>
  Effect.forEach(numbers, (n) => {
    const known = memo.get(n);
    return known === undefined ? compileOne(n) : Effect.succeed(known);
  });

/** The hymns whose sung lines are not their printed lines in sung order, each with its first difference. */
const unfaithful = (hymns: readonly Compiled[]): string[] =>
  hymns.flatMap(({ number, printed, hymn }) => {
    if (Result.isFailure(printed)) return [`${number}: ${printed.failure}`];
    if (Result.isFailure(hymn)) return [`${number}: ${hymn.failure}`];
    const got = sung(hymn.success).map((line) => words(line.text));
    const want = expected(printed.success).map(words);
    const at = got.findIndex((line, i) => line !== want[i]);
    if (at < 0 && got.length === want.length) return [];
    const k = at < 0 ? Math.min(got.length, want.length) : at;
    return [
      `${number}: line ${k + 1} of ${got.length} sung "${got[k] ?? ''}", printed ${want.length} "${want[k] ?? ''}"`,
    ];
  });

const numbers = (lines: readonly string[]) => lines.map((line) => Number(line.split(':')[0]));

/** Each hymn, changed by `change` where it returns a hymn; the numbers of those changed. */
const mutate = (hymns: readonly Compiled[], change: (hymn: Hymn) => Hymn | undefined) => {
  const changed: number[] = [];
  const out = hymns.map((one) => {
    if (Result.isFailure(one.hymn)) return one;
    const next = change(one.hymn.success);
    if (next === undefined) return one;
    changed.push(one.number);
    return { ...one, hymn: Result.succeed(next) };
  });
  return { hymns: out, changed };
};

/** A part with line k gone, or none when it has no line k (or would have no line left). */
const withoutLine = (part: Part, k: number): Part | undefined => {
  if (part.lines.length <= Math.max(k, 1)) return undefined;
  if (part._tag === 'Plain') {
    const lines = part.lines.filter((_, i) => i !== k);
    return Arr.isArrayNonEmpty(lines) ? { ...part, lines } : undefined;
  }
  const lines = part.lines.filter((_, i) => i !== k);
  return Arr.isArrayNonEmpty(lines) ? { ...part, lines } : undefined;
};

const lastLine = (part: Part) => part.lines.length - 1;

/** A part's lines as words: a plain line as printed, a sung line's syllables joined by word. */
const textOf = (part: Part): string[] =>
  part._tag === 'Plain'
    ? [...part.lines]
    : part.lines.map((line) =>
        line.map((s, k) => `${k > 0 && line[k - 1]?.word !== s.word ? ' ' : ''}${s.text}`).join(''),
      );

/** The hymns the census places a refrain for, in order: the oracle's list, never the compiler's. */
const listed = Effect.map(orders, ({ printed }) => [...printed.keys()].toSorted((a, b) => a - b));

describe('compile: text fidelity', () => {
  // The property, a hundred hymns to a case: each case well inside the test timeout under load.
  for (const chunk of Arr.chunksOf(ALL, 100)) {
    const [first = 0] = chunk;
    const last = chunk.at(-1) ?? first;
    it.effect(
      `hymns ${first}-${last} each sing their printed text, line for line, in the order the hymnal sings it`,
      () =>
        Effect.gen(function* () {
          const hymns = yield* compiledOf(chunk);
          expect(hymns.map((one) => one.number)).toEqual(chunk);
          expect(unfaithful(hymns)).toEqual([]);
        }).pipe(Effect.provide(layer)),
    );
  }

  it.effect(
    'flags 171 and 612 (stanza 1 holds the refrain words) with the refrain gone, or its last line',
    () =>
      Effect.gen(function* () {
        const hymns = yield* compiledOf([171, 612]);
        const pick = (n: number) => n === 171 || n === 612;
        const gone = mutate(hymns, (hymn) => {
          if (!pick(hymn.number)) return undefined;
          const { refrain: _gone, ...bare } = hymn;
          return bare;
        });
        expect(gone.changed).toEqual([171, 612]);
        expect(numbers(unfaithful(gone.hymns))).toEqual([171, 612]);
        const cut = mutate(hymns, (hymn) => {
          const refrain = hymn.refrain;
          if (!pick(hymn.number) || refrain === undefined) return undefined;
          const part = withoutLine(refrain.part, lastLine(refrain.part));
          return part === undefined ? undefined : { ...hymn, refrain: { ...refrain, part } };
        });
        expect(cut.changed).toEqual([171, 612]);
        expect(numbers(unfaithful(cut.hymns))).toEqual([171, 612]);
      }).pipe(Effect.provide(layer)),
  );

  it.effect('flags every hymn whose refrain is sung once, after stanza 1 alone', () =>
    Effect.gen(function* () {
      const hymns = yield* compiledOf(ALL);
      const once = mutate(hymns, (hymn) => {
        const [first, ...rest] = hymn.stanzas;
        const refrain = hymn.refrain?.part;
        const { refrain: _gone, ...bare } = hymn;
        if (refrain === undefined) return undefined;
        if (first._tag === 'Sung' && refrain._tag === 'Sung') {
          return {
            ...bare,
            stanzas: [{ ...first, lines: [...first.lines, ...refrain.lines] }, ...rest],
          };
        }
        // A sung stanza and a plain refrain (or the other way): stanza 1 becomes their words.
        const [line, ...lines] = [...textOf(first), ...textOf(refrain)];
        const plain: Part = { _tag: 'Plain', lines: [line ?? '', ...lines], why: ['notes'] };
        return { ...bare, stanzas: [plain, ...rest] };
      });
      expect(once.changed).toEqual(yield* listed);
      expect(numbers(unfaithful(once.hymns))).toEqual(once.changed);
    }).pipe(Effect.provide(layer)),
  );

  it.effect(
    'flags each hymn whose refrain the hymnal sings otherwise, compiled as sung after each stanza',
    () =>
      Effect.gen(function* () {
        const hymns = yield* compiledOf(ALL);
        const { printed } = yield* orders;
        const after = mutate(hymns, (hymn) => {
          const refrain = hymn.refrain;
          if (refrain === undefined || refrain.order === 'after-each') return undefined;
          return { ...hymn, refrain: { ...refrain, order: 'after-each' } };
        });
        const otherwise = [...printed]
          .filter(([, order]) => order !== 'after-each')
          .map(([n]) => n)
          .toSorted((a, b) => a - b);
        expect(after.changed).toEqual(otherwise);
        expect(numbers(unfaithful(after.hymns))).toEqual(after.changed);
      }).pipe(Effect.provide(layer)),
  );

  it.effect('flags each hymn with a stanza that lost a line beyond its 8th', () =>
    Effect.gen(function* () {
      const hymns = yield* compiledOf(ALL);
      const short = mutate(hymns, (hymn) => {
        const n = hymn.stanzas.findIndex((part) => part.lines.length > 8);
        const target = hymn.stanzas[n];
        const part = target === undefined ? undefined : withoutLine(target, 8);
        if (part === undefined) return undefined;
        const stanzas = hymn.stanzas.map((one, i) => (i === n ? part : one));
        return Arr.isArrayNonEmpty(stanzas) ? { ...hymn, stanzas } : undefined;
      });
      expect(short.changed.length).toBeGreaterThan(10);
      expect(numbers(unfaithful(short.hymns))).toEqual(short.changed);
    }).pipe(Effect.provide(layer)),
  );
});
