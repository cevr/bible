// @effect-diagnostics nodeBuiltinImport:off anyUnknownInErrorContext:off
/**
 * StructuralAnalysis Service Tests
 *
 * Tests the deterministic passage analysis orchestration layer.
 * Uses the real bible.db — tests are skipped if the DB is not available.
 */

import { existsSync } from 'fs';
import { join } from 'path';

import { BunServices } from '@effect/platform-bun';
import { beforeAll, describe, expect, it } from 'bun:test';
import { Effect, Layer, ManagedRuntime } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { StructuralAnalysis } from './service.js';
import { SYMBOLIC_NUMBERS } from './types.js';

const DB_PATH = join(import.meta.dir, '../../data/bible.db');
const DB_EXISTS = existsSync(DB_PATH);

const TestLayer = StructuralAnalysis.Live.pipe(
  Layer.provideMerge(BibleDatabase.Default),
  Layer.provideMerge(BunServices.layer),
);

const runtime = ManagedRuntime.make(TestLayer);

function run<A>(effect: Effect.Effect<A, unknown, StructuralAnalysis>) {
  return runtime.runPromise(effect);
}

const skip = () => {
  if (!DB_EXISTS) {
    console.log('Bible database not found — skipping structural analysis tests');
    return true;
  }
  return false;
};

describe('StructuralAnalysis', () => {
  beforeAll(async () => {
    if (!DB_EXISTS) return;
    // Warm up runtime
    await run(
      Effect.gen(function* () {
        const sa = yield* StructuralAnalysis;
        yield* sa.getPassageWords(1, 1, 1, 1);
      }),
    );
  });

  describe('getPassageWords', () => {
    it('returns words keyed by verse number', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageWords(1, 1, 1, 3); // Gen 1:1-3
        }),
      );

      expect(result.size).toBe(3);
      expect(result.has(1)).toBe(true);
      expect(result.has(2)).toBe(true);
      expect(result.has(3)).toBe(true);

      const v1Words = result.get(1);
      expect(v1Words).toBeDefined();
      expect(v1Words?.length).toBeGreaterThan(0);
      // Gen 1:1 should contain "In" or "beginning"
      const texts = v1Words?.map((w) => w.text.toLowerCase()) ?? [];
      expect(texts.some((t) => t.includes('beginning') || t.includes('in'))).toBe(true);
    });

    it("returns words with Strong's numbers attached", async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageWords(1, 1, 1, 1); // Gen 1:1
        }),
      );

      const v1Words = result.get(1) ?? [];
      // At least some words should have Strong's numbers
      const withStrongs = v1Words.filter(
        (w) => w.strongsNumbers !== null && w.strongsNumbers.length > 0,
      );
      expect(withStrongs.length).toBeGreaterThan(0);
    });
  });

  describe('getWordFrequency', () => {
    it('counts word occurrences across a passage', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          // Revelation 1:1-8 — enough text for meaningful counts
          return yield* sa.getWordFrequency(66, 1, 1, 8);
        }),
      );

      expect(result.entries.length).toBeGreaterThan(0);
      // Entries should be sorted by count descending
      for (let i = 1; i < result.entries.length; i++) {
        const current = result.entries[i];
        const previous = result.entries[i - 1];
        if (current !== undefined && previous !== undefined) {
          expect(current.count).toBeLessThanOrEqual(previous.count);
        }
      }
    });

    it('flags symbolic counts correctly', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          // Use a larger passage to increase chance of symbolic counts
          return yield* sa.getWordFrequency(1, 1, 1, 31); // Gen 1 (all 31 verses)
        }),
      );

      // Every entry with a symbolic count should match the SYMBOLIC_NUMBERS list
      for (const entry of result.entries) {
        if (entry.symbolicCount !== null) {
          expect((SYMBOLIC_NUMBERS as readonly number[]).includes(entry.symbolicCount)).toBe(true);
          expect(entry.count).toBe(entry.symbolicCount);
        }
      }

      // symbolicEntries should be a subset of entries
      expect(result.symbolicEntries.length).toBeLessThanOrEqual(result.entries.length);
      for (const se of result.symbolicEntries) {
        expect(se.symbolicCount).not.toBeNull();
      }
    });

    it('normalizes words to lowercase and strips punctuation', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getWordFrequency(1, 1, 1, 5); // Gen 1:1-5
        }),
      );

      for (const entry of result.entries) {
        expect(entry.word).toBe(entry.word.toLowerCase());
        expect(entry.word).toMatch(/^[a-z']+$/);
      }
    });
  });

  describe('getStrongsRoots', () => {
    it("returns entries for known Strong's numbers", async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getStrongsRoots(['H430', 'H1254', 'G26']);
        }),
      );

      expect(result.size).toBe(3);

      const elohim = result.get('H430');
      expect(elohim).toBeDefined();
      expect(elohim?.lemma).toBeDefined();
      expect(elohim?.definition).toBeDefined();

      const agape = result.get('G26');
      expect(agape).toBeDefined();
    });

    it("skips unknown Strong's numbers without error", async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getStrongsRoots(['H430', 'H99999', 'G26']);
        }),
      );

      // Should have 2, not 3 — H99999 doesn't exist
      expect(result.size).toBe(2);
      expect(result.has('H430')).toBe(true);
      expect(result.has('G26')).toBe(true);
      expect(result.has('H99999')).toBe(false);
    });

    it('handles empty input', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getStrongsRoots([]);
        }),
      );

      expect(result.size).toBe(0);
    });
  });

  describe('getPassageCrossRefs', () => {
    it('returns cross-refs keyed by verse number', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageCrossRefs(43, 3, 16, 18); // John 3:16-18
        }),
      );

      expect(result.size).toBe(3);
      expect(result.has(16)).toBe(true);
      expect(result.has(17)).toBe(true);
      expect(result.has(18)).toBe(true);

      // John 3:16 should have cross-refs
      const v16Refs = result.get(16);
      expect(v16Refs).toBeDefined();
      expect(v16Refs?.length).toBeGreaterThan(0);
    });
  });

  describe('getPassageMarginNotes', () => {
    it('returns margin notes keyed by verse number', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageMarginNotes(1, 1, 1, 5); // Gen 1:1-5
        }),
      );

      expect(result.size).toBe(5);
      // All verse keys should be present even if no notes
      for (let v = 1; v <= 5; v++) {
        expect(result.has(v)).toBe(true);
      }
    });
  });

  describe('getPassageContext', () => {
    it('returns combined context for a passage', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageContext(1, 1, 1, 5); // Gen 1:1-5
        }),
      );

      // Metadata
      expect(result.book).toBe(1);
      expect(result.chapter).toBe(1);
      expect(result.verseStart).toBe(1);
      expect(result.verseEnd).toBe(5);

      // Verses
      expect(result.verses.length).toBeGreaterThan(0);
      expect(result.verses.length).toBeLessThanOrEqual(5);

      // Words
      expect(result.words.size).toBeGreaterThan(0);

      // Strong's entries gathered from words
      expect(result.strongsEntries.size).toBeGreaterThan(0);

      // Cross-refs
      expect(result.crossRefs.size).toBe(5);

      // Margin notes
      expect(result.marginNotes.size).toBe(5);

      // Word frequency
      expect(result.wordFrequency.entries.length).toBeGreaterThan(0);
    });

    it("gathers Strong's entries from all verse words", async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageContext(1, 1, 1, 1); // Gen 1:1
        }),
      );

      // Collect all Strong's numbers from words
      const wordStrongsNumbers = new Set<string>();
      for (const words of result.words.values()) {
        for (const w of words) {
          if (w.strongsNumbers !== null) {
            for (const sn of w.strongsNumbers) wordStrongsNumbers.add(sn);
          }
        }
      }

      // Every Strong's number from words should have an entry (if it exists in DB)
      for (const sn of wordStrongsNumbers) {
        const entry = result.strongsEntries.get(sn);
        if (entry !== undefined) {
          expect(entry.number).toBe(sn);
        }
      }
    });
  });
});
