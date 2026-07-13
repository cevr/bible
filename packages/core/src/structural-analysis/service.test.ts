/**
 * StructuralAnalysis Service Tests
 *
 * Tests the deterministic passage analysis orchestration layer.
 * Uses the real bible.db — tests are skipped if the DB is not available.
 */

import { existsSync } from 'fs';
import { join } from 'path';

import { beforeAll, describe, expect, it } from 'bun:test';
import { Effect, Layer, ManagedRuntime } from 'effect';

import * as BibleDbBun from '../bible-db/bible-database-bun.js';
import { StructuralAnalysis } from './service.js';
import { SYMBOLIC_NUMBERS } from './types.js';

const DB_PATH = join(import.meta.dir, '../../data/bible.db');
const DB_EXISTS = existsSync(DB_PATH);

const TestLayer = StructuralAnalysis.Live.pipe(Layer.provideMerge(BibleDbBun.layerBun(DB_PATH)));

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
        yield* sa.getPassageContext(1, 1, 1, 1);
      }),
    );
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
      expect(result.words.size).toBe(5);
      for (let verse = 1; verse <= 5; verse++) {
        expect(result.words.has(verse)).toBe(true);
      }
      const firstVerseWords = result.words.get(1) ?? [];
      expect(firstVerseWords.length).toBeGreaterThan(0);
      expect(
        firstVerseWords.some((word) =>
          ['in', 'beginning'].some((text) => word.text.toLowerCase().includes(text)),
        ),
      ).toBe(true);
      expect(
        firstVerseWords.some(
          (word) => word.strongsNumbers !== null && word.strongsNumbers.length > 0,
        ),
      ).toBe(true);

      // Strong's entries gathered from words
      expect(result.strongsEntries.size).toBeGreaterThan(0);

      // Cross-refs
      expect(result.crossRefs.size).toBe(5);
      for (let verse = 1; verse <= 5; verse++) {
        expect(result.crossRefs.has(verse)).toBe(true);
      }

      // Margin notes
      expect(result.marginNotes.size).toBe(5);
      for (let verse = 1; verse <= 5; verse++) {
        expect(result.marginNotes.has(verse)).toBe(true);
      }

      // Word frequency
      expect(result.wordFrequency.entries.length).toBeGreaterThan(0);
      for (let index = 1; index < result.wordFrequency.entries.length; index++) {
        const current = result.wordFrequency.entries[index];
        const previous = result.wordFrequency.entries[index - 1];
        if (current !== undefined && previous !== undefined) {
          expect(current.count).toBeLessThanOrEqual(previous.count);
        }
      }
      for (const entry of result.wordFrequency.entries) {
        expect(entry.word).toBe(entry.word.toLowerCase());
        expect(entry.word).toMatch(/^[a-z']+$/);
        if (entry.symbolicCount !== null) {
          expect((SYMBOLIC_NUMBERS as readonly number[]).includes(entry.symbolicCount)).toBe(true);
          expect(entry.count).toBe(entry.symbolicCount);
        }
      }
      expect(result.wordFrequency.symbolicEntries.length).toBeLessThanOrEqual(
        result.wordFrequency.entries.length,
      );
      for (const entry of result.wordFrequency.symbolicEntries) {
        expect(entry.symbolicCount).not.toBeNull();
      }
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

    it('includes cross-references for each verse in a passage', async () => {
      if (skip()) return;
      const result = await run(
        Effect.gen(function* () {
          const sa = yield* StructuralAnalysis;
          return yield* sa.getPassageContext(43, 3, 16, 18); // John 3:16-18
        }),
      );

      expect(result.crossRefs.size).toBe(3);
      expect(result.crossRefs.has(16)).toBe(true);
      expect(result.crossRefs.has(17)).toBe(true);
      expect(result.crossRefs.has(18)).toBe(true);
      expect(result.crossRefs.get(16)?.length).toBeGreaterThan(0);
    });
  });
});
