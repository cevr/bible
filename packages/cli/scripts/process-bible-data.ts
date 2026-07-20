/**
 * Process raw Bible study data into JSON assets for bundling.
 *
 * This script processes:
 * 1. Cross-references from OpenBible.info TSV
 * 2. Strong's Hebrew and Greek dictionaries
 * 3. KJV verses with Strong's numbers
 *
 * Output files are placed in assets/ for bundling with the CLI.
 */

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Path, Schema, SchemaGetter } from 'effect';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson(),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const LexiconValue = Schema.Struct({
  Gk_word: Schema.optional(Schema.String),
  Heb_word: Schema.optional(Schema.String),
  transliteration: Schema.optional(Schema.String),
  strongs_def: Schema.optional(Schema.String),
  part_of_speech: Schema.optional(Schema.String),
  outline_usage: Schema.optional(Schema.String),
});
const LexiconData = Schema.Record(Schema.String, LexiconValue);

const HebrewValue = Schema.Struct({
  lemma: Schema.String,
  xlit: Schema.String,
  pron: Schema.optional(Schema.String),
  strongs_def: Schema.String,
  kjv_def: Schema.optional(Schema.String),
});
const HebrewData = Schema.Record(Schema.String, HebrewValue);

const GreekValue = Schema.Struct({
  lemma: Schema.String,
  translit: Schema.optional(Schema.String),
  xlit: Schema.optional(Schema.String),
  pron: Schema.optional(Schema.String),
  strongs_def: Schema.optional(Schema.String),
  kjv_def: Schema.optional(Schema.String),
  derivation: Schema.optional(Schema.String),
});
const GreekData = Schema.Record(Schema.String, GreekValue);

const KjvVerse = Schema.Struct({ en: Schema.String });
const KjvBookData = Schema.Record(
  Schema.String,
  Schema.Record(Schema.String, Schema.Record(Schema.String, KjvVerse)),
);

const decodeJson = <S extends Schema.Top>(schema: S, source: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(source);

// Book abbreviation mapping (OpenBible format -> our book numbers)
const BOOK_MAP: Record<string, number> = {
  Gen: 1,
  Exod: 2,
  Lev: 3,
  Num: 4,
  Deut: 5,
  Josh: 6,
  Judg: 7,
  Ruth: 8,
  '1Sam': 9,
  '2Sam': 10,
  '1Kgs': 11,
  '2Kgs': 12,
  '1Chr': 13,
  '2Chr': 14,
  Ezra: 15,
  Neh: 16,
  Esth: 17,
  Job: 18,
  Ps: 19,
  Prov: 20,
  Eccl: 21,
  Song: 22,
  Isa: 23,
  Jer: 24,
  Lam: 25,
  Ezek: 26,
  Dan: 27,
  Hos: 28,
  Joel: 29,
  Amos: 30,
  Obad: 31,
  Jonah: 32,
  Mic: 33,
  Nah: 34,
  Hab: 35,
  Zeph: 36,
  Hag: 37,
  Zech: 38,
  Mal: 39,
  Matt: 40,
  Mark: 41,
  Luke: 42,
  John: 43,
  Acts: 44,
  Rom: 45,
  '1Cor': 46,
  '2Cor': 47,
  Gal: 48,
  Eph: 49,
  Phil: 50,
  Col: 51,
  '1Thess': 52,
  '2Thess': 53,
  '1Tim': 54,
  '2Tim': 55,
  Titus: 56,
  Phlm: 57,
  Heb: 58,
  Jas: 59,
  '1Pet': 60,
  '2Pet': 61,
  '1John': 62,
  '2John': 63,
  '3John': 64,
  Jude: 65,
  Rev: 66,
};

// KJV-Strongs book abbreviation mapping
const KJV_STRONGS_BOOK_MAP: Record<string, number> = {
  Gen: 1,
  Exo: 2,
  Lev: 3,
  Num: 4,
  Deu: 5,
  Jos: 6,
  Jdg: 7,
  Rth: 8,
  '1Sa': 9,
  '2Sa': 10,
  '1Ki': 11,
  '2Ki': 12,
  '1Ch': 13,
  '2Ch': 14,
  Ezr: 15,
  Neh: 16,
  Est: 17,
  Job: 18,
  Psa: 19,
  Pro: 20,
  Ecc: 21,
  Sng: 22,
  Isa: 23,
  Jer: 24,
  Lam: 25,
  Eze: 26,
  Dan: 27,
  Hos: 28,
  Joe: 29,
  Amo: 30,
  Oba: 31,
  Jon: 32,
  Mic: 33,
  Nah: 34,
  Hab: 35,
  Zep: 36,
  Hag: 37,
  Zec: 38,
  Mal: 39,
  Mat: 40,
  Mar: 41,
  Luk: 42,
  Jhn: 43,
  Act: 44,
  Rom: 45,
  '1Co': 46,
  '2Co': 47,
  Gal: 48,
  Eph: 49,
  Phl: 50,
  Col: 51,
  '1Th': 52,
  '2Th': 53,
  '1Ti': 54,
  '2Ti': 55,
  Tit: 56,
  Phm: 57,
  Heb: 58,
  Jas: 59,
  '1Pe': 60,
  '2Pe': 61,
  '1Jo': 62,
  '2Jo': 63,
  '3Jo': 64,
  Jde: 65,
  Rev: 66,
};

interface Reference {
  book: number;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}

interface CrossRefEntry {
  refs: Reference[];
}

interface StrongsEntry {
  lemma: string;
  xlit: string;
  pron?: string;
  def: string;
  kjvDef?: string;
}

/**
 * Clean HTML entities from string
 */
function cleanHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8212;?-?/g, '—') // em-dash with potential trailing dash
    .replace(/&quot-/g, '"') // Fix malformed entities
    .replace(/-&quot/g, '"');
}

interface WordWithStrongs {
  text: string;
  strongs?: string[];
}

interface VerseWithStrongs {
  book: number;
  chapter: number;
  verse: number;
  words: WordWithStrongs[];
}

/**
 * Parse OpenBible reference format: "Gen.1.1" or "Ps.89.11-Ps.89.12"
 */
function parseOpenBibleRef(ref: string): Reference | null {
  // Handle range: "Ps.89.11-Ps.89.12"
  const rangeParts = ref.split('-');
  const mainRef = rangeParts[0];
  if (mainRef === undefined) return null;

  const parts = mainRef.split('.');
  const [bookName, chapterText, verseText] = parts;
  if (bookName === undefined || chapterText === undefined || verseText === undefined) return null;

  const bookNum = BOOK_MAP[bookName];
  if (!bookNum) return null;

  const chapter = parseInt(chapterText, 10);
  const verse = parseInt(verseText, 10);

  if (isNaN(chapter) || isNaN(verse)) return null;

  const result: Reference = { book: bookNum, chapter, verse };

  // Handle verse range
  const endRef = rangeParts[1];
  if (endRef !== undefined) {
    const endVerseText = endRef.split('.')[2];
    if (endVerseText !== undefined) {
      const endVerse = parseInt(endVerseText, 10);
      if (!isNaN(endVerse)) {
        result.verseEnd = endVerse;
      }
    }
  }

  return result;
}

/**
 * Create a reference key for our format: "1.1.1" (book.chapter.verse)
 */
function refKey(ref: Reference): string {
  return `${ref.book}.${ref.chapter}.${ref.verse}`;
}

/**
 * Process cross-references TSV
 */
const processCrossRefs = Effect.fn('processCrossRefs')(function* (dataRaw: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Effect.log('Processing cross-references...');

  const tsvPath = path.join(dataRaw, 'cross_references.txt');
  const content = yield* fs.readFileString(tsvPath);
  const lines = content.split('\n');

  const crossRefs: Record<string, CrossRefEntry> = {};
  let processed = 0;
  let skipped = 0;

  for (const line of lines) {
    // Skip header and comments
    if (line.startsWith('#') || line.startsWith('From')) continue;
    if (!line.trim()) continue;

    const [fromRef, toRef] = line.split('\t');
    if (!fromRef || !toRef) continue;

    const from = parseOpenBibleRef(fromRef);
    const to = parseOpenBibleRef(toRef);

    if (!from || !to) {
      skipped++;
      continue;
    }

    const key = refKey(from);
    if (!crossRefs[key]) {
      crossRefs[key] = { refs: [] };
    }
    crossRefs[key].refs.push(to);
    processed++;
  }

  yield* Effect.log(`  Processed ${processed} cross-references, skipped ${skipped}`);
  return crossRefs;
});

/**
 * Process Strong's dictionaries from multiple sources
 */
const processStrongs = Effect.fn('processStrongs')(function* (dataRaw: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Effect.log("Processing Strong's dictionaries...");

  const strongs: Record<string, StrongsEntry> = {};
  const optionalClean = (value: string | undefined): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    return cleanHtmlEntities(value);
  };

  // First, try loading from the lexicon.json (kaiserlik/kjv) - has Greek and Hebrew
  const lexiconPath = path.join(dataRaw, 'kjv-strongs/lexicon.json');
  const lexiconData = yield* fs.readFileString(lexiconPath).pipe(
    Effect.flatMap((source) => decodeJson(LexiconData, source)),
    Effect.option,
  );
  if (Option.isSome(lexiconData)) {
    for (const [key, value] of Object.entries(lexiconData.value)) {
      const v = value;
      strongs[key] = {
        lemma: v.Gk_word || v.Heb_word || '',
        xlit: v.transliteration || '',
        def: cleanHtmlEntities(v.strongs_def || v.outline_usage || ''),
      };
    }
    yield* Effect.log(
      `  Loaded ${Object.keys(lexiconData.value).length} entries from lexicon.json`,
    );
  } else {
    yield* Effect.logWarning('  Could not load lexicon.json');
  }

  // Then supplement with OpenScriptures Hebrew data (has more detail)
  const hebrewPath = path.join(dataRaw, 'strongs/hebrew/strongs-hebrew-dictionary.js');
  const hebrewContent = yield* fs.readFileString(hebrewPath).pipe(Effect.option);
  if (Option.isSome(hebrewContent)) {
    const hebrewMatch = hebrewContent.value.match(
      /var strongsHebrewDictionary = (\{[\s\S]*?\n\});/,
    );

    if (hebrewMatch?.[1] !== undefined) {
      const hebrewData = yield* decodeJson(HebrewData, hebrewMatch[1]).pipe(Effect.option);
      if (Option.isSome(hebrewData)) {
        let added = 0;
        for (const [key, value] of Object.entries(hebrewData.value)) {
          const v = value;
          // Only add if we don't have it or if OpenScriptures has more detail
          if (!strongs[key] || !strongs[key].def) {
            strongs[key] = {
              lemma: v.lemma,
              xlit: v.xlit,
              pron: v.pron,
              def: cleanHtmlEntities(v.strongs_def),
              kjvDef: optionalClean(v.kjv_def),
            };
            added++;
          } else if (v.pron && !strongs[key].pron) {
            // Add pronunciation if missing
            strongs[key].pron = v.pron;
            strongs[key].kjvDef = optionalClean(v.kjv_def);
          }
        }
        yield* Effect.log(`  Added/updated ${added} Hebrew entries from OpenScriptures`);
      } else {
        yield* Effect.logWarning('  Could not parse Hebrew dictionary');
      }
    }
  } else {
    yield* Effect.logWarning('  Could not parse Hebrew dictionary');
  }

  // Supplement with OpenScriptures Greek data
  const greekPath = path.join(dataRaw, 'strongs/greek/strongs-greek-dictionary.js');
  const greekContent = yield* fs.readFileString(greekPath).pipe(Effect.option);
  if (Option.isSome(greekContent)) {
    const greekMatch = greekContent.value.match(/var strongsGreekDictionary = (\{.*\});/);

    if (greekMatch?.[1] !== undefined) {
      const greekData = yield* decodeJson(GreekData, greekMatch[1]).pipe(Effect.option);
      if (Option.isSome(greekData)) {
        let added = 0;
        for (const [key, value] of Object.entries(greekData.value)) {
          const v = value;
          if (!strongs[key] || !strongs[key].def) {
            strongs[key] = {
              lemma: v.lemma,
              xlit: v.translit || v.xlit || '',
              pron: v.pron,
              def: cleanHtmlEntities(v.strongs_def || v.derivation || ''),
              kjvDef: optionalClean(v.kjv_def),
            };
            added++;
          } else if (v.pron && !strongs[key].pron) {
            strongs[key].pron = v.pron;
            strongs[key].kjvDef = optionalClean(v.kjv_def);
          }
        }
        yield* Effect.log(`  Added/updated ${added} Greek entries from OpenScriptures`);
      } else {
        yield* Effect.logWarning('  Could not parse Greek dictionary');
      }
    }
  } else {
    yield* Effect.logWarning('  Could not parse Greek dictionary');
  }

  return strongs;
});

/**
 * Parse a word with inline Strong's numbers: "beginning[H7225]" or "was[G2258]"
 * Returns the word and any Strong's numbers
 */
function parseWordWithStrongs(text: string): WordWithStrongs {
  const strongsPattern = /\[([HG]\d+)\]/g;
  const strongs: string[] = [];
  let match;

  while ((match = strongsPattern.exec(text)) !== null) {
    const strongsNumber = match[1];
    if (strongsNumber !== undefined) {
      strongs.push(strongsNumber);
    }
  }

  // Remove Strong's markers and <em> tags
  const cleanText = text
    .replace(/\[([HG]\d+)\]/g, '')
    .replace(/<\/?em>/g, '')
    .trim();

  const result: WordWithStrongs = { text: cleanText };
  if (strongs.length > 0) {
    result.strongs = strongs;
  }
  return result;
}

/**
 * Process KJV with Strong's numbers
 */
const processKjvStrongs = Effect.fn('processKjvStrongs')(function* (dataRaw: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* Effect.log("Processing KJV with Strong's numbers...");

  const kjvDir = path.join(dataRaw, 'kjv-strongs');
  const verses: VerseWithStrongs[] = [];

  // Get all book files (exclude metadata files and non-JSON)
  const excludeFiles = ['books.json', 'chapter_count.json', 'lexicon.json', 'README.md'];
  const files = (yield* fs.readDirectory(kjvDir)).filter(
    (file) => file.endsWith('.json') && !excludeFiles.includes(file),
  );

  for (const file of files) {
    const bookAbbr = file.replace('.json', '');
    const bookNum = KJV_STRONGS_BOOK_MAP[bookAbbr];

    if (!bookNum) {
      yield* Effect.logWarning(`  Skipping unknown book: ${bookAbbr}`);
      continue;
    }

    const bookPath = path.join(kjvDir, file);
    const bookData = yield* fs.readFileString(bookPath).pipe(
      Effect.flatMap((source) => decodeJson(KjvBookData, source)),
      Effect.option,
    );
    if (Option.isNone(bookData)) {
      yield* Effect.logError(`  ERROR parsing ${file}`);
      continue;
    }

    // Navigate the nested structure: { "Gen": { "Gen|1": { "Gen|1|1": { "en": "..." } } } }
    const bookContent = bookData.value[bookAbbr];
    if (!bookContent) continue;

    for (const [chapterKey, chapterContent] of Object.entries(bookContent)) {
      const chapterText = chapterKey.split('|')[1];
      if (chapterText === undefined) continue;
      const chapterNum = parseInt(chapterText, 10);

      for (const [verseKey, verseContent] of Object.entries(chapterContent)) {
        const verseText = verseKey.split('|')[2];
        if (verseText === undefined) continue;
        const verseNum = parseInt(verseText, 10);
        const englishText = verseContent.en;

        if (!englishText) continue;

        // Split into words and parse Strong's numbers
        // Words are separated by spaces, but punctuation sticks to words
        const rawWords = englishText.split(/\s+/);
        const words: WordWithStrongs[] = [];

        for (const rawWord of rawWords) {
          if (!rawWord) continue;
          const parsed = parseWordWithStrongs(rawWord);
          if (parsed.text) {
            words.push(parsed);
          }
        }

        verses.push({
          book: bookNum,
          chapter: chapterNum,
          verse: verseNum,
          words,
        });
      }
    }
  }

  // Sort by book, chapter, verse
  verses.sort((a, b) => {
    if (a.book !== b.book) return a.book - b.book;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });

  yield* Effect.log(`  Processed ${verses.length} verses`);
  return verses;
});

// Main processing
const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dataRaw = path.join(import.meta.dir, '../assets/data-raw');
  const assets = path.join(import.meta.dir, '../assets');
  yield* Effect.log('=== Processing Bible Study Data ===\n');

  const crossRefs = yield* processCrossRefs(dataRaw);
  yield* fs.writeFileString(path.join(assets, 'cross-refs.json'), yield* encodeJson(crossRefs));
  yield* Effect.log(
    `  Wrote cross-refs.json (${Object.keys(crossRefs).length} verses with refs)\n`,
  );

  const strongs = yield* processStrongs(dataRaw);
  yield* fs.writeFileString(path.join(assets, 'strongs.json'), yield* encodeJson(strongs));
  yield* Effect.log(`  Wrote strongs.json (${Object.keys(strongs).length} entries)\n`);

  const kjvStrongs = yield* processKjvStrongs(dataRaw);
  yield* fs.writeFileString(path.join(assets, 'kjv-strongs.json'), yield* encodeJson(kjvStrongs));
  yield* Effect.log(`  Wrote kjv-strongs.json (${kjvStrongs.length} verses)\n`);

  yield* Effect.log('=== Done ===');
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
