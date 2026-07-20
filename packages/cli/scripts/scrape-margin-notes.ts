/**
 * Scrape KJV 1611 Margin Notes with phrase-level anchoring.
 *
 * Source: https://en.literaturabautista.com/exhaustive-listing-marginal-notes-1611-edition-king-james-bible
 *
 * This source provides phrase-level data showing which text each margin note applies to.
 * Format: "Genesis 1:6 firmament: Heb. expansion"
 *   - Reference: Genesis 1:6
 *   - Phrase: "firmament"
 *   - Note: "Heb. expansion"
 *
 * Output: assets/margin-notes.json with structure:
 * {
 *   "1.1.6": [{ "type": "hebrew", "phrase": "firmament", "text": "Heb. expansion" }]
 * }
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import * as BunHttpClient from '@effect/platform-bun/BunHttpClient';
import { Effect, FileSystem, Layer, Path, Schema, SchemaGetter } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';

const URL =
  'https://en.literaturabautista.com/exhaustive-listing-marginal-notes-1611-edition-king-james-bible';
const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

// Book name to number mapping
const BOOK_MAP: Record<string, number> = {
  Genesis: 1,
  Exodus: 2,
  Leviticus: 3,
  Numbers: 4,
  Deuteronomy: 5,
  Joshua: 6,
  Judges: 7,
  Ruth: 8,
  '1 Samuel': 9,
  '2 Samuel': 10,
  '1 Kings': 11,
  '2 Kings': 12,
  '1 Chronicles': 13,
  '2 Chronicles': 14,
  Ezra: 15,
  Nehemiah: 16,
  Esther: 17,
  Job: 18,
  Psalm: 19,
  Psalms: 19,
  Proverbs: 20,
  Ecclesiastes: 21,
  'Song of Solomon': 22,
  Isaiah: 23,
  Jeremiah: 24,
  Lamentations: 25,
  Ezekiel: 26,
  Daniel: 27,
  Hosea: 28,
  Joel: 29,
  Amos: 30,
  Obadiah: 31,
  Jonah: 32,
  Micah: 33,
  Nahum: 34,
  Habakkuk: 35,
  Zephaniah: 36,
  Haggai: 37,
  Zechariah: 38,
  Malachi: 39,
  Matthew: 40,
  Mark: 41,
  Luke: 42,
  John: 43,
  Acts: 44,
  Romans: 45,
  '1 Corinthians': 46,
  '2 Corinthians': 47,
  Galatians: 48,
  Ephesians: 49,
  Philippians: 50,
  Colossians: 51,
  '1 Thessalonians': 52,
  '2 Thessalonians': 53,
  '1 Timothy': 54,
  '2 Timothy': 55,
  Titus: 56,
  Philemon: 57,
  Hebrews: 58,
  James: 59,
  '1 Peter': 60,
  '2 Peter': 61,
  '1 John': 62,
  '2 John': 63,
  '3 John': 64,
  Jude: 65,
  Revelation: 66,
};

// Build regex for book names
const bookNames = Object.keys(BOOK_MAP)
  .sort((a, b) => b.length - a.length)
  .join('|');
const ENTRY_REGEX = new RegExp(`(${bookNames})\\s+(\\d+):(\\d+)\\s+([^:]+):\\s*(.+)`, 'g');

interface MarginNote {
  type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
  phrase: string;
  text: string;
}

function classifyNote(text: string): MarginNote['type'] {
  const t = text.trim().toLowerCase();
  if (t.startsWith('heb.') || t.startsWith('hebr.')) return 'hebrew';
  if (t.startsWith('gr.') || t.startsWith('greek')) return 'greek';
  if (t.startsWith('or,') || t.startsWith('or ')) return 'alternate';
  if (t.startsWith('that is,') || t.startsWith('i.e.')) return 'name';
  return 'other';
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&#8211;/g, '-') // En-dash
    .replace(/&#8212;/g, '-') // Em-dash
    .replace(/&#8217;/g, "'") // Apostrophe
    .replace(/&#8220;/g, '"') // Left quote
    .replace(/&#8221;/g, '"') // Right quote
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const assets = path.join(import.meta.dir, '../assets');
  yield* Effect.log('=== Scraping KJV 1611 Margin Notes ===\n');
  yield* Effect.log(`Fetching ${URL}...\n`);

  const html = yield* HttpClient.get(URL).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap((response) => response.text),
  );

  yield* Effect.log(`Downloaded ${html.length} bytes\n`);

  // Extract all margin note entries
  const notesMap: Record<string, MarginNote[]> = {};
  let count = 0;
  const seen = new Set<string>(); // Dedupe

  let match;
  while ((match = ENTRY_REGEX.exec(html)) !== null) {
    const [, bookName, chapter, verse, phraseRaw, noteTextRaw] = match;
    if (
      bookName === undefined ||
      chapter === undefined ||
      verse === undefined ||
      phraseRaw === undefined ||
      noteTextRaw === undefined
    ) {
      continue;
    }
    const bookNum = BOOK_MAP[bookName];

    if (!bookNum) {
      yield* Effect.logWarning(`  Unknown book: ${bookName}`);
      continue;
    }

    const phrase = cleanText(phraseRaw);
    const noteText = cleanText(noteTextRaw);

    // Skip if phrase starts with dash (artifact)
    if (phrase.startsWith('-')) continue;

    // Dedupe key
    const dedupeKey = `${bookNum}.${chapter}.${verse}:${phrase}:${noteText}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const key = `${bookNum}.${chapter}.${verse}`;
    const note: MarginNote = {
      type: classifyNote(noteText),
      phrase,
      text: noteText,
    };

    if (!notesMap[key]) {
      notesMap[key] = [];
    }
    notesMap[key].push(note);
    count++;
  }

  // Stats
  const byType = { hebrew: 0, greek: 0, alternate: 0, name: 0, other: 0 };
  for (const notes of Object.values(notesMap)) {
    for (const note of notes) {
      byType[note.type]++;
    }
  }

  yield* Effect.log(
    `Extracted ${count} margin notes from ${Object.keys(notesMap).length} verses\n`,
  );
  yield* Effect.log('By type:');
  yield* Effect.log(`  Hebrew: ${byType.hebrew}`);
  yield* Effect.log(`  Greek: ${byType.greek}`);
  yield* Effect.log(`  Alternate: ${byType.alternate}`);
  yield* Effect.log(`  Name meanings: ${byType.name}`);
  yield* Effect.log(`  Other: ${byType.other}`);

  // Write output
  const outputPath = path.join(assets, 'margin-notes.json');
  yield* fs.writeFileString(outputPath, yield* encodeJson(notesMap));
  yield* Effect.log(`\nWrote ${outputPath}\n`);

  // Sample output
  yield* Effect.log('Sample entries:');
  const samples = Object.entries(notesMap).slice(0, 5);
  for (const [key, notes] of samples) {
    yield* Effect.log(`  ${key}:`);
    for (const note of notes) {
      yield* Effect.log(`    "${note.phrase}" -> ${note.text}`);
    }
  }

  yield* Effect.log('\n=== Done ===');
});

main.pipe(
  Effect.provide(Layer.mergeAll(BunServices.layer, BunHttpClient.layer)),
  BunRuntime.runMain,
);
