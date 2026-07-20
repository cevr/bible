/**
 * StructuralAnalysis Service Tests
 *
 * Tests the deterministic passage analysis orchestration layer.
 * Uses the real bible.db — tests are skipped if the DB is not available.
 */

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as BibleDbBun from '../bible-db/bible-database-bun.js';
import { StructuralAnalysis } from './service.js';
import { SYMBOLIC_NUMBERS } from './types.js';

const TestLayer = (database: string) =>
  StructuralAnalysis.Live.pipe(Layer.provideMerge(BibleDbBun.layerBun(database)));

describe('StructuralAnalysis', () => {
  describe('getPassageContext', () => {
    const test = it.scopedLive.layer(BunServices.layer);

    test('returns combined context for a passage', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const database = path.resolve(import.meta.dir, '../../data/bible.db');
        if (!(yield* fs.exists(database))) return;
        const result = yield* StructuralAnalysis.use((analysis) =>
          analysis.getPassageContext(1, 1, 1, 5),
        ).pipe(Effect.provide(TestLayer(database)));

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
            expect((SYMBOLIC_NUMBERS as readonly number[]).includes(entry.symbolicCount)).toBe(
              true,
            );
            expect(entry.count).toBe(entry.symbolicCount);
          }
        }
        expect(result.wordFrequency.symbolicEntries.length).toBeLessThanOrEqual(
          result.wordFrequency.entries.length,
        );
        for (const entry of result.wordFrequency.symbolicEntries) {
          expect(entry.symbolicCount).not.toBeNull();
        }
      }));

    test("gathers Strong's entries from all verse words", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const database = path.resolve(import.meta.dir, '../../data/bible.db');
        if (!(yield* fs.exists(database))) return;
        const result = yield* StructuralAnalysis.use((analysis) =>
          analysis.getPassageContext(1, 1, 1, 1),
        ).pipe(Effect.provide(TestLayer(database)));

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
      }));

    test('includes cross-references for each verse in a passage', () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const database = path.resolve(import.meta.dir, '../../data/bible.db');
        if (!(yield* fs.exists(database))) return;
        const result = yield* StructuralAnalysis.use((analysis) =>
          analysis.getPassageContext(43, 3, 16, 18),
        ).pipe(Effect.provide(TestLayer(database)));

        expect(result.crossRefs.size).toBe(3);
        expect(result.crossRefs.has(16)).toBe(true);
        expect(result.crossRefs.has(17)).toBe(true);
        expect(result.crossRefs.has(18)).toBe(true);
        expect(result.crossRefs.get(16)?.length).toBeGreaterThan(0);
      }));
  });
});
