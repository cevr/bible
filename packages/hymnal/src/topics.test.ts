import { layerHymnalBun } from '@bible/core/hymnal/bun';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, ConfigProvider, Effect, FileSystem, Layer, Option, Result, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { buildTopics, decodeFixes, type Fixes, readRows, type Rows } from '../scripts/topics.js';
import { type Topic, Topics, topicOf } from './hymn.js';

/** The tracked hymnal.db, read as the compile script reads it. */
const hymnal = layerHymnalBun.pipe(
  Layer.provide(BunServices.layer),
  Layer.provide(
    ConfigProvider.layer(
      ConfigProvider.fromEnv({
        env: {
          HOME: '/',
          HYMNAL_DB_PATH: new URL('../../core/data/hymnal.db', import.meta.url).pathname,
        },
      }),
    ),
  ),
);

const TOPICS = new URL('../data/sdah-1985/topics.json', import.meta.url).pathname;
const FIXES = new URL('../data/fixes/topics.json', import.meta.url).pathname;

const TopicsJson = Schema.fromJsonString(Topics);
const encodeTopics = Schema.encodeEffect(TopicsJson);
const decodeTopics = Schema.decodeUnknownEffect(TopicsJson);

/** The db's rows, the fixes, and the committed table, decoded. */
const inputs = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const rows = yield* readRows;
  const fixes = yield* decodeFixes(yield* fs.readFileString(FIXES));
  const text = yield* fs.readFileString(TOPICS);
  const committed = yield* decodeTopics(text);
  return { rows, fixes, text, committed };
}).pipe(Effect.provide(Layer.merge(hymnal, BunServices.layer)));

const fold = (s: string) => s.toLowerCase();

/** The section a move files hymn n under, else the db's. */
const expectedSection = (rows: Rows, fixes: Fixes, n: number) =>
  fixes.moves.find((m) => m.first <= n && n <= m.last)?.to ??
  rows.hymns.find((h) => h.number === n)?.categoryId;

describe('topics: the compiled table', () => {
  it.effect('is the builder output over the db rows and the fixes, byte for byte', () =>
    Effect.gen(function* () {
      const { rows, fixes, text } = yield* inputs;
      const built = yield* buildTopics(rows, fixes);
      expect(`${yield* encodeTopics(built)}\n`).toBe(text);
    }),
  );

  it.effect('gives every hymn 1-695 exactly one topic, the db section or its move', () =>
    Effect.gen(function* () {
      const { rows, fixes, committed } = yield* inputs;
      for (let n = 1; n <= 695; n++) {
        const holding = committed.topics.filter((t) => t.first <= n && n <= t.last);
        expect(holding.length).toBe(1);
        const topic = topicOf(committed, n);
        expect(Option.getOrUndefined(topic)?.id).toBe(expectedSection(rows, fixes, n));
        expect(Option.getOrUndefined(topic)).toBe(holding[0]);
      }
      for (const n of [0, 696, -1, 1.5]) expect(Option.isNone(topicOf(committed, n))).toBe(true);
    }),
  );

  it.effect(
    'holds 62 topics, the printed ranges of the two split sections, and trimmed names',
    () =>
      Effect.gen(function* () {
        const { committed } = yield* inputs;
        const byName = (name: string) => committed.topics.find((t) => t.name === name);
        expect(committed.topics.length).toBe(62);
        expect(byName('Salvation and Redemption')).toMatchObject({ first: 334, last: 343 });
        expect(byName('Eternal Life')).toMatchObject({ first: 420, last: 437 });
        for (const t of committed.topics) expect(t.name).toBe(t.name.trim());
      }),
  );
});

describe('topics: evidence', () => {
  it.effect(
    'witnesses every moved hymn, every heading and every renamed section from the print',
    () =>
      Effect.gen(function* () {
        const { rows, fixes, committed } = yield* inputs;
        const printed = fixes.printed.filter((p) => p.from !== 'contiguity');
        const nameOf = (n: number) => Option.getOrThrow(topicOf(committed, n)).name;
        const printedAs = (n: number, heading: string) =>
          printed.some((p) => p.hymn === n && fold(p.heading) === fold(heading));
        for (const move of fixes.moves) {
          const to = committed.topics.find((t) => t.id === move.to)?.name ?? '';
          for (let n = move.first; n <= move.last; n++) {
            const contiguous = fixes.printed.some((p) => p.hymn === n && p.from === 'contiguity');
            const ok =
              printedAs(n, to) || (contiguous && printedAs(n - 1, to) && printedAs(n + 1, to));
            expect([n, ok]).toEqual([n, true]);
          }
        }
        for (const p of fixes.printed)
          expect([p.hymn, fold(p.heading)]).toEqual([p.hymn, fold(nameOf(p.hymn))]);
        // A contiguity witness stands only between two printed witnesses of its heading.
        for (const p of fixes.printed.filter((w) => w.from === 'contiguity')) {
          expect([
            p.hymn,
            printedAs(p.hymn - 1, p.heading),
            printedAs(p.hymn + 1, p.heading),
          ]).toEqual([p.hymn, true, true]);
        }
        // A name is the db's trimmed, or the print's with a photo witness under that section.
        for (const { id, name } of fixes.names) {
          const db = rows.categories.find((c) => c.id === id)?.name;
          const topic = committed.topics.find((t) => t.id === id);
          const photographed = printed.some(
            (p) =>
              p.from.startsWith('photos/') &&
              topic !== undefined &&
              topic.first <= p.hymn &&
              p.hymn <= topic.last &&
              fold(p.heading) === fold(name),
          );
          expect([id, db?.trim() === name || photographed]).toEqual([id, true]);
        }
      }),
  );
});

describe('topics: the builder', () => {
  it.effect('refuses db rows with a section split in two and no move for it', () =>
    Effect.gen(function* () {
      const { rows, fixes } = yield* inputs;
      const error = yield* Effect.flip(buildTopics(rows, { ...fixes, moves: [] }));
      expect(error).toMatchObject({ _tag: 'TopicsError', reason: 'a section split in two' });
    }),
  );
});

/** mulberry32: a seeded PRNG giving floats in [0, 1). */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A random partition of 1-695 into 2 to 80 ranges, ids shuffled. */
const partition = (random: () => number): Topic[] => {
  const count = 2 + Math.floor(random() * 79);
  const cuts = new Set<number>();
  while (cuts.size < count - 1) cuts.add(2 + Math.floor(random() * 694));
  const starts = [1, ...[...cuts].sort((a, b) => a - b)];
  const ids = starts.map((_, i) => i + 1).sort(() => random() - 0.5);
  return starts.map((first, i) => ({
    id: ids[i] ?? 0,
    name: `Topic ${i}`,
    first,
    last: (starts[i + 1] ?? 696) - 1,
  }));
};

const MUTATIONS = {
  gap: (t: Topic[], random: () => number) => {
    const i = t.findIndex((x, k) => k > 0 && x.first < x.last);
    const at = i >= 0 ? i : Math.floor(random() * t.length);
    const x = t[at]!;
    t[at] = i >= 0 ? { ...x, first: x.first + 1 } : { ...t[0]!, last: t[0]!.last - 1 };
  },
  overlap: (t: Topic[], random: () => number) => {
    const at = 1 + Math.floor(random() * (t.length - 1));
    t[at] = { ...t[at]!, first: t[at]!.first - 1 };
  },
  swap: (t: Topic[], random: () => number) => {
    const at = Math.floor(random() * (t.length - 1));
    [t[at], t[at + 1]] = [t[at + 1]!, t[at]!];
  },
  reversed: (t: Topic[], random: () => number) => {
    const at = Math.floor(random() * t.length);
    t[at] = { ...t[at]!, first: t[at]!.last + 1 };
  },
  start: (t: Topic[]) => {
    t[0] = { ...t[0]!, first: t[0]!.first === t[0]!.last ? 0 : 2 };
  },
  end: (t: Topic[], random: () => number) => {
    const last = t.length - 1;
    t[last] = { ...t[last]!, last: random() < 0.5 ? 694 : 696 };
  },
  duplicate: (t: Topic[], random: () => number) => {
    const at = 1 + Math.floor(random() * (t.length - 1));
    t[at] = { ...t[at]!, id: t[0]!.id };
  },
  empty: (t: Topic[], random: () => number) => {
    const at = Math.floor(random() * t.length);
    t[at] = { ...t[at]!, name: '' };
  },
  padded: (t: Topic[], random: () => number) => {
    const at = Math.floor(random() * t.length);
    t[at] = { ...t[at]!, name: random() < 0.5 ? ` ${t[at]!.name}` : `${t[at]!.name}\r` };
  },
} satisfies Record<string, (t: Topic[], random: () => number) => void>;

describe('topics: the schema', () => {
  it.effect('decodes 500 random partitions and refuses each with one fault', () =>
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownResult(Topics);
      const kinds = Object.keys(MUTATIONS) as Array<keyof typeof MUTATIONS>;
      const seed = yield* Config.Int('TOPICS_SEED').pipe(Config.withDefault(20261020));
      const random = mulberry32(seed);
      const faults: string[] = [];
      for (let i = 0; i < 500; i++) {
        const topics = partition(random);
        const kind = kinds[i % kinds.length]!;
        const table = (t: Topic[]) => ({ version: 1, book: 'sdah-1985', topics: t });
        const where = `TOPICS_SEED=${seed} case ${i} ${kind}`;
        if (!Result.isSuccess(decode(table(topics)))) faults.push(`${where}: a partition refused`);
        const mutant = topics.map((t) => ({ ...t }));
        MUTATIONS[kind](mutant, random);
        if (Result.isSuccess(decode(table(mutant)))) faults.push(`${where}: a mutant decoded`);
      }
      expect(faults).toEqual([]);
    }),
  );
});
