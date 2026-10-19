/**
 * Compiles every hymn of the 1985 SDA Hymnal (1–695) from its text in
 * hymnal.db and its MIDI file into the files the app reads:
 *
 *   bun run compile [--db <hymnal.db>] [--midi <dir>] [--out <dir>] [--key <dir>]
 *
 * It writes `<out>/NNN.json` (one hymn each) and `<out>/index.json`, decodes
 * each file back through the schema, and writes the report beside the
 * folder (`<out>.report.md`): the hymns and parts by level, the reasons,
 * the inexact and count-mismatched files, the held list, the refrains by
 * order (each sung otherwise than after each stanza in its sung order), the
 * alignment key's comparison and the time taken. Paths default to the
 * repository's (`packages/core/data/hymnal.db`, `packages/hymnal/data/midi`,
 * `packages/hymnal/data/sdah-1985`, `packages/hymnal/data/key`); where a
 * refrain is sung comes from `data/fixes/refrains.json` (`./sources.ts`).
 * The same inputs give byte-identical hymn files.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { HymnalService, HymnId } from '@bible/core/hymnal';
import { layerHymnalBun } from '@bible/core/hymnal/bun';
import { ConfigProvider, Data, Effect, Layer, Result, Schema } from 'effect';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { compile } from '../src/compile.js';
import { Hymn, Index, type Level, Order, type Part, type Reason, sung } from '../src/hymn.js';
import { decodeOrders, HELD, sourceOf } from './sources.js';

const ROOT = path.resolve(import.meta.dir, '../../..');
const FIRST = 1;
const LAST = 695;

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return path.resolve(ROOT, at < 0 ? fallback : (args[at + 1] ?? fallback));
};
const db = flag('--db', 'packages/core/data/hymnal.db');
const midiDir = flag('--midi', 'packages/hymnal/data/midi');
const out = flag('--out', 'packages/hymnal/data/sdah-1985');
const keyDir = flag('--key', 'packages/hymnal/data/key');

/** Where the hymnal sings each refrain, read off its page. */
const REFRAINS = path.resolve(import.meta.dir, '../data/fixes/refrains.json');

const pad = (n: number) => String(n).padStart(3, '0');

/**
 * The refrains by order, and each hymn sung otherwise than after each stanza
 * with its verses in sung order (`R` the refrain): `93: R 1 R 2 R 3 R 4 R`.
 */
const refrainsOf = (compiled: readonly Hymn[]) => {
  const withRefrain = compiled.flatMap((hymn) =>
    hymn.refrain === undefined ? [] : [{ hymn, order: hymn.refrain.order }],
  );
  const orders: readonly Order[] = Order.literals;
  const outline = (hymn: Hymn) =>
    sung(hymn)
      .filter((line) => line.line === 0)
      .map((line) => (line.verse === 'refrain' ? 'R' : String(line.verse)))
      .join(' ');
  return [
    ...orders.map((order) => `- ${order}: ${withRefrain.filter((r) => r.order === order).length}`),
    '',
    ...withRefrain
      .filter((r) => r.order !== 'after-each')
      .map((r) => `- ${r.hymn.number} (${r.order}): ${outline(r.hymn)}`),
  ];
};
const RANK: Record<Level, number> = { text: 0, line: 1, syllable: 2 };
const levelOf = (part: Part): Level => (part._tag === 'Plain' ? 'text' : part.level);
const partsOf = (hymn: Hymn): Part[] => [
  ...hymn.stanzas,
  ...(hymn.refrain === undefined ? [] : [hymn.refrain.part]),
];
const lowest = (hymn: Hymn): Level =>
  partsOf(hymn)
    .map(levelOf)
    .reduce((a, b) => (RANK[b] < RANK[a] ? b : a));

const encodeHymn = Schema.encodeSync(Hymn);
const encodeIndex = Schema.encodeSync(Index);
const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(Hymn));
const decodeIndex = Schema.decodeUnknownEffect(Schema.fromJsonString(Index));

/** A key file's lines: each syllable's letters and its notes (`text_N`, `text_0`; one by default). */
const readKey = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) =>
      line.split(/\s+/).map((token) => {
        const [, word = token, notes = '1'] = /^(.*)_(\d+)$/.exec(token) ?? [];
        return { text: word, notes: Number(notes) };
      }),
    );

const letters = (text: string) => text.toLowerCase().replace(/[^a-z]/g, '');

interface KeyResult {
  readonly number: number;
  readonly level: Level;
  readonly lines: number;
  readonly exact: number;
  readonly cuts: number;
  readonly misses: readonly string[];
  /** The key's lines (1-based) whose notes the compile does not match. */
  readonly inexact: readonly number[];
}

/** Compares a hymn's stanza 1 and refrain with its key: a line is exact when its syllables' notes match. */
const compareKey = (hymn: Hymn, key: ReturnType<typeof readKey>): KeyResult => {
  const first = hymn.stanzas[0];
  const sung: ReadonlyArray<ReadonlyArray<{ readonly text: string; readonly notes: number }>> = [
    first,
    ...(hymn.refrain === undefined ? [] : [hymn.refrain.part]),
  ].flatMap(
    (part): ReadonlyArray<ReadonlyArray<{ readonly text: string; readonly notes: number }>> =>
      part._tag === 'Sung' ? part.lines : part.lines.map(() => []),
  );
  let [exact, cuts] = [0, 0];
  const misses: string[] = [];
  const inexact: number[] = [];
  key.forEach((line, i) => {
    const mine = sung[i] ?? [];
    const same = mine.length === line.length && line.every((s, k) => mine[k]?.notes === s.notes);
    if (same) exact += 1;
    else {
      inexact.push(i + 1);
      const shown = mine.map((s) => `${s.text}${s.notes === 1 ? '' : `_${s.notes}`}`).join(' ');
      misses.push(
        `line ${i + 1}: key \`${line.map((s) => `${s.text}${s.notes === 1 ? '' : `_${s.notes}`}`).join(' ')}\` compiled \`${shown}\``,
      );
    }
    if (mine.length === line.length) {
      cuts += line.filter((s, k) => letters(s.text) !== letters(mine[k]?.text ?? '')).length;
    }
  });
  return {
    number: hymn.number,
    level: levelOf(first),
    lines: key.length,
    exact,
    cuts,
    misses,
    inexact,
  };
};

class Failed extends Data.TaggedError('Failed')<{ readonly why: string }> {}

/** Compiles hymn n and writes its file. */
const compileOne = (n: number, orders: ReadonlyMap<number, Order>) =>
  Effect.gen(function* () {
    const text = yield* (yield* HymnalService)
      .getHymn(HymnId.make(n))
      .pipe(Effect.mapError((e) => new Failed({ why: `${n}: ${e._tag}` })));
    const file = Bun.file(path.join(midiDir, `${pad(n)}.mid`));
    if (!(yield* Effect.promise(() => file.exists()))) {
      return yield* new Failed({ why: `${n}: no MIDI file` });
    }
    const midi = yield* Effect.promise(() => file.bytes());
    const source = yield* sourceOf(
      { number: n, name: text.name, verses: text.verses },
      midi,
      orders,
    ).pipe(Effect.mapError((e) => new Failed({ why: `${n}: ${e.reason} in refrains.json` })));
    const hymn = yield* compile(source).pipe(
      Effect.mapError(
        (e) =>
          new Failed({
            why:
              e._tag === 'MidiParseError'
                ? `${n}: ${e.reason} at byte ${e.offset}`
                : `${n}: verse layout refused (${e.reason}; ids ${e.ids.join(' ')})`,
          }),
      ),
    );
    yield* Effect.promise(() =>
      Bun.write(path.join(out, `${pad(n)}.json`), `${JSON.stringify(encodeHymn(hymn))}\n`),
    );
    return hymn;
  });

/** Writes the index, then decodes every file written back through the schema: how many decoded. */
const writeIndex = (compiled: readonly Hymn[]) =>
  Effect.gen(function* () {
    const index: Index = {
      version: 1,
      book: 'sdah-1985',
      hymns: compiled.map((hymn) => ({
        number: hymn.number,
        title: hymn.title,
        level: lowest(hymn),
      })),
    };
    yield* Effect.promise(() =>
      Bun.write(path.join(out, 'index.json'), `${JSON.stringify(encodeIndex(index))}\n`),
    );
    let decoded = 0;
    for (const hymn of compiled) {
      const file = Bun.file(path.join(out, `${pad(hymn.number)}.json`));
      yield* decodeHymn(yield* Effect.promise(() => file.text()));
      decoded += 1;
    }
    yield* decodeIndex(yield* Effect.promise(() => Bun.file(path.join(out, 'index.json')).text()));
    return decoded;
  });

/** Each hymn with a key file, compared with it. */
const readKeys = (compiled: readonly Hymn[]) =>
  Effect.gen(function* () {
    const keys: KeyResult[] = [];
    for (const hymn of compiled) {
      const file = Bun.file(path.join(keyDir, `${pad(hymn.number)}.txt`));
      if (yield* Effect.promise(() => file.exists())) {
        keys.push(compareKey(hymn, readKey(yield* Effect.promise(() => file.text()))));
      }
    }
    return keys;
  });

const tally = (compiled: readonly Hymn[]) => {
  const byHymn = { syllable: 0, line: 0, text: 0 };
  const byPart = { syllable: 0, line: 0, text: 0 };
  const reasons = new Map<Reason, number>();
  for (const hymn of compiled) {
    byHymn[lowest(hymn)] += 1;
    for (const part of partsOf(hymn)) {
      byPart[levelOf(part)] += 1;
      for (const why of part.why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
    }
  }
  return { byHymn, byPart, reasons };
};

const keyLineOf = (keys: readonly KeyResult[]) => {
  const sum = (rows: readonly KeyResult[], field: 'lines' | 'exact') =>
    rows.reduce((total, row) => total + row[field], 0);
  const perLevel = (['syllable', 'line', 'text'] as const).map((level) => {
    const rows = keys.filter((row) => row.level === level);
    return `${level}.lines=${sum(rows, 'lines')} ${level}.exact=${sum(rows, 'exact')}`;
  });
  return `key verses=${keys.length} lines=${sum(keys, 'lines')} exact=${sum(keys, 'exact')} ${perLevel.join(' ')}`;
};

interface Run {
  readonly summary: string;
  readonly compiled: readonly Hymn[];
  readonly failed: readonly string[];
  readonly counts: ReturnType<typeof tally>;
  readonly keys: readonly KeyResult[];
  readonly keyLine: string;
  readonly seconds: string;
}

const reportOf = ({ summary, compiled, failed, counts, keys, keyLine, seconds }: Run) => {
  const inexact = compiled.filter((hymn) => !hymn.verses.exact).map((hymn) => hymn.number);
  const mismatched = compiled
    .filter((hymn) => hymn.verses.text !== hymn.verses.midi)
    .map((hymn) => `${hymn.number} (text ${hymn.verses.text}, MIDI ${hymn.verses.midi})`);
  const levels = ['syllable', 'line', 'text'] as const;
  return [
    '# SDA Hymnal (1985): compile report',
    '',
    `\`${summary}\``,
    '',
    '## Levels',
    '',
    '| level | hymns (lowest part) | parts |',
    '| --- | --- | --- |',
    ...levels.map((l) => `| ${l} | ${counts.byHymn[l]} | ${counts.byPart[l]} |`),
    '',
    '## Reasons (parts)',
    '',
    ...[...counts.reasons].map(([why, count]) => `- ${why}: ${count}`),
    '',
    '## Inexact verse splits',
    '',
    inexact.join(' ') || 'none',
    '',
    '## Stanza and verse counts that differ',
    '',
    mismatched.join(', ') || 'none',
    '',
    '## Held',
    '',
    ...[...HELD].map(([n, why]) => `- ${n}: ${why}`),
    '',
    '## Refrains',
    '',
    ...refrainsOf(compiled),
    '',
    '## Failed',
    '',
    ...(failed.length === 0 ? ['none'] : failed.map((line) => `- ${line}`)),
    '',
    '## Alignment key',
    '',
    `\`${keyLine}\``,
    '',
    'The level is judged from the fit alone: a hymn at `syllable` with lines below exact has lines laid a note off that no threshold sees.',
    '',
    '| hymn | level | lines | exact | cut differences |',
    '| --- | --- | --- | --- | --- |',
    ...keys.map((k) => `| ${k.number} | ${k.level} | ${k.lines} | ${k.exact} | ${k.cuts} |`),
    '',
    'Each key line the compile does not match, as `key inexact <hymn>:<line>`:',
    '',
    ...keys.flatMap((k) => k.inexact.map((line) => `key inexact ${k.number}:${line}`)),
    '',
    ...keys.flatMap((k) =>
      k.misses.length === 0 ? [] : [`### ${k.number}`, '', ...k.misses.map((m) => `- ${m}`), ''],
    ),
    `Took ${seconds} s.`,
    '',
  ].join('\n');
};

const program = Effect.gen(function* () {
  const started = performance.now();
  yield* Effect.promise(() => mkdir(out, { recursive: true }));
  const orders = yield* decodeOrders(yield* Effect.promise(() => Bun.file(REFRAINS).text()));
  const results = yield* Effect.forEach(
    Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i),
    (n) => Effect.result(compileOne(n, orders)),
  );
  const compiled = results.filter(Result.isSuccess).map((r) => r.success);
  const failed = results.filter(Result.isFailure).map((r) => r.failure.why);
  const decoded = yield* writeIndex(compiled);
  const keys = yield* readKeys(compiled);
  const counts = tally(compiled);
  const keyLine = keyLineOf(keys);
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const { byHymn, byPart } = counts;
  const summary = `hymns=${results.length} compiled=${compiled.length} failed=${failed.length} decoded=${decoded} syllable=${byHymn.syllable} line=${byHymn.line} text=${byHymn.text}`;
  const report = reportOf({ summary, compiled, failed, counts, keys, keyLine, seconds });
  yield* Effect.promise(() => Bun.write(`${out}.report.md`, report));
  console.log(
    `${summary} parts.syllable=${byPart.syllable} parts.line=${byPart.line} parts.text=${byPart.text} seconds=${seconds}`,
  );
  console.log(keyLine);
  if (failed.length > 0 || decoded !== compiled.length) process.exitCode = 1;
});

const layer = layerHymnalBun.pipe(
  Layer.provide(BunServices.layer),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({ env: { HOME: process.env['HOME'] ?? '', HYMNAL_DB_PATH: db } }),
    ),
  ),
);

await Effect.runPromise(program.pipe(Effect.provide(layer)));
