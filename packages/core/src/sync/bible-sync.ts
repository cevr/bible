#!/usr/bin/env bun
// @effect-diagnostics nodeBuiltinImport:off
/**
 * Bible Sync Script
 *
 * Creates and populates the unified Bible database from JSON sources.
 *
 * Data sources (from packages/core/assets/):
 * - kjv.json: KJV verse text
 * - cross-refs.json: Cross-reference mappings
 * - strongs.json: Strong's concordance definitions
 * - kjv-strongs.json: Verse-word Strong's mappings
 * - margin-notes.json: 1611 KJV margin notes
 *
 * Output: packages/core/data/bible.db
 *
 * Usage:
 *   bun run src/sync/bible-sync.ts [--force]
 *
 * Options:
 *   --force    Recreate database even if it exists
 */

import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const ASSETS_DIR = path.resolve(import.meta.dir, '../../assets');
const DATA_DIR = path.resolve(import.meta.dir, '../../data');
const SCHEMA_PATH = path.resolve(import.meta.dir, '../bible-db/schema.sql');
const DB_PATH = path.resolve(DATA_DIR, 'bible.db');

// ============================================================================
// JSON Data Types
// ============================================================================

interface KJVData {
  metadata: {
    name: string;
    shortname: string;
    year?: string;
    copyright_statement?: string;
  };
  verses: Array<{
    book_name: string;
    book: number;
    chapter: number;
    verse: number;
    text: string;
  }>;
}

interface CrossRefsData {
  [key: string]: {
    refs: Array<{
      book: number;
      chapter: number;
      verse?: number;
      verseEnd?: number;
    }>;
  };
}

interface StrongsData {
  [key: string]: {
    lemma: string;
    xlit?: string;
    def: string;
  };
}

interface KJVStrongsData extends Array<{
  book: number;
  chapter: number;
  verse: number;
  words: Array<{
    text: string;
    strongs?: string[];
  }>;
}> {}

interface MarginNotesData {
  [key: string]: Array<{
    type: 'hebrew' | 'greek' | 'alternate' | 'name' | 'other';
    phrase: string;
    text: string;
  }>;
}

// ============================================================================
// Book Metadata
// ============================================================================

const BOOKS: Array<{
  number: number;
  name: string;
  abbreviation: string;
  testament: 'old' | 'new';
  chapters: number;
}> = [
  { number: 1, name: 'Genesis', abbreviation: 'Gen', testament: 'old', chapters: 50 },
  { number: 2, name: 'Exodus', abbreviation: 'Exod', testament: 'old', chapters: 40 },
  { number: 3, name: 'Leviticus', abbreviation: 'Lev', testament: 'old', chapters: 27 },
  { number: 4, name: 'Numbers', abbreviation: 'Num', testament: 'old', chapters: 36 },
  { number: 5, name: 'Deuteronomy', abbreviation: 'Deut', testament: 'old', chapters: 34 },
  { number: 6, name: 'Joshua', abbreviation: 'Josh', testament: 'old', chapters: 24 },
  { number: 7, name: 'Judges', abbreviation: 'Judg', testament: 'old', chapters: 21 },
  { number: 8, name: 'Ruth', abbreviation: 'Ruth', testament: 'old', chapters: 4 },
  { number: 9, name: '1 Samuel', abbreviation: '1Sam', testament: 'old', chapters: 31 },
  { number: 10, name: '2 Samuel', abbreviation: '2Sam', testament: 'old', chapters: 24 },
  { number: 11, name: '1 Kings', abbreviation: '1Kgs', testament: 'old', chapters: 22 },
  { number: 12, name: '2 Kings', abbreviation: '2Kgs', testament: 'old', chapters: 25 },
  { number: 13, name: '1 Chronicles', abbreviation: '1Chr', testament: 'old', chapters: 29 },
  { number: 14, name: '2 Chronicles', abbreviation: '2Chr', testament: 'old', chapters: 36 },
  { number: 15, name: 'Ezra', abbreviation: 'Ezra', testament: 'old', chapters: 10 },
  { number: 16, name: 'Nehemiah', abbreviation: 'Neh', testament: 'old', chapters: 13 },
  { number: 17, name: 'Esther', abbreviation: 'Esth', testament: 'old', chapters: 10 },
  { number: 18, name: 'Job', abbreviation: 'Job', testament: 'old', chapters: 42 },
  { number: 19, name: 'Psalms', abbreviation: 'Ps', testament: 'old', chapters: 150 },
  { number: 20, name: 'Proverbs', abbreviation: 'Prov', testament: 'old', chapters: 31 },
  { number: 21, name: 'Ecclesiastes', abbreviation: 'Eccl', testament: 'old', chapters: 12 },
  { number: 22, name: 'Song of Solomon', abbreviation: 'Song', testament: 'old', chapters: 8 },
  { number: 23, name: 'Isaiah', abbreviation: 'Isa', testament: 'old', chapters: 66 },
  { number: 24, name: 'Jeremiah', abbreviation: 'Jer', testament: 'old', chapters: 52 },
  { number: 25, name: 'Lamentations', abbreviation: 'Lam', testament: 'old', chapters: 5 },
  { number: 26, name: 'Ezekiel', abbreviation: 'Ezek', testament: 'old', chapters: 48 },
  { number: 27, name: 'Daniel', abbreviation: 'Dan', testament: 'old', chapters: 12 },
  { number: 28, name: 'Hosea', abbreviation: 'Hos', testament: 'old', chapters: 14 },
  { number: 29, name: 'Joel', abbreviation: 'Joel', testament: 'old', chapters: 3 },
  { number: 30, name: 'Amos', abbreviation: 'Amos', testament: 'old', chapters: 9 },
  { number: 31, name: 'Obadiah', abbreviation: 'Obad', testament: 'old', chapters: 1 },
  { number: 32, name: 'Jonah', abbreviation: 'Jonah', testament: 'old', chapters: 4 },
  { number: 33, name: 'Micah', abbreviation: 'Mic', testament: 'old', chapters: 7 },
  { number: 34, name: 'Nahum', abbreviation: 'Nah', testament: 'old', chapters: 3 },
  { number: 35, name: 'Habakkuk', abbreviation: 'Hab', testament: 'old', chapters: 3 },
  { number: 36, name: 'Zephaniah', abbreviation: 'Zeph', testament: 'old', chapters: 3 },
  { number: 37, name: 'Haggai', abbreviation: 'Hag', testament: 'old', chapters: 2 },
  { number: 38, name: 'Zechariah', abbreviation: 'Zech', testament: 'old', chapters: 14 },
  { number: 39, name: 'Malachi', abbreviation: 'Mal', testament: 'old', chapters: 4 },
  { number: 40, name: 'Matthew', abbreviation: 'Matt', testament: 'new', chapters: 28 },
  { number: 41, name: 'Mark', abbreviation: 'Mark', testament: 'new', chapters: 16 },
  { number: 42, name: 'Luke', abbreviation: 'Luke', testament: 'new', chapters: 24 },
  { number: 43, name: 'John', abbreviation: 'John', testament: 'new', chapters: 21 },
  { number: 44, name: 'Acts', abbreviation: 'Acts', testament: 'new', chapters: 28 },
  { number: 45, name: 'Romans', abbreviation: 'Rom', testament: 'new', chapters: 16 },
  { number: 46, name: '1 Corinthians', abbreviation: '1Cor', testament: 'new', chapters: 16 },
  { number: 47, name: '2 Corinthians', abbreviation: '2Cor', testament: 'new', chapters: 13 },
  { number: 48, name: 'Galatians', abbreviation: 'Gal', testament: 'new', chapters: 6 },
  { number: 49, name: 'Ephesians', abbreviation: 'Eph', testament: 'new', chapters: 6 },
  { number: 50, name: 'Philippians', abbreviation: 'Phil', testament: 'new', chapters: 4 },
  { number: 51, name: 'Colossians', abbreviation: 'Col', testament: 'new', chapters: 4 },
  { number: 52, name: '1 Thessalonians', abbreviation: '1Thess', testament: 'new', chapters: 5 },
  { number: 53, name: '2 Thessalonians', abbreviation: '2Thess', testament: 'new', chapters: 3 },
  { number: 54, name: '1 Timothy', abbreviation: '1Tim', testament: 'new', chapters: 6 },
  { number: 55, name: '2 Timothy', abbreviation: '2Tim', testament: 'new', chapters: 4 },
  { number: 56, name: 'Titus', abbreviation: 'Titus', testament: 'new', chapters: 3 },
  { number: 57, name: 'Philemon', abbreviation: 'Phlm', testament: 'new', chapters: 1 },
  { number: 58, name: 'Hebrews', abbreviation: 'Heb', testament: 'new', chapters: 13 },
  { number: 59, name: 'James', abbreviation: 'Jas', testament: 'new', chapters: 5 },
  { number: 60, name: '1 Peter', abbreviation: '1Pet', testament: 'new', chapters: 5 },
  { number: 61, name: '2 Peter', abbreviation: '2Pet', testament: 'new', chapters: 3 },
  { number: 62, name: '1 John', abbreviation: '1John', testament: 'new', chapters: 5 },
  { number: 63, name: '2 John', abbreviation: '2John', testament: 'new', chapters: 1 },
  { number: 64, name: '3 John', abbreviation: '3John', testament: 'new', chapters: 1 },
  { number: 65, name: 'Jude', abbreviation: 'Jude', testament: 'new', chapters: 1 },
  { number: 66, name: 'Revelation', abbreviation: 'Rev', testament: 'new', chapters: 22 },
];

// ============================================================================
// Utility Functions
// ============================================================================

function loadJson<T>(filename: string): T {
  const filepath = path.join(ASSETS_DIR, filename);
  console.log(`Loading ${filename}...`);
  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as T;
}

function parseVerseKey(key: string): { book: number; chapter: number; verse: number } | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  const [bookStr, chapterStr, verseStr] = parts;
  if (bookStr === undefined || chapterStr === undefined || verseStr === undefined) return null;
  return {
    book: parseInt(bookStr, 10),
    chapter: parseInt(chapterStr, 10),
    verse: parseInt(verseStr, 10),
  };
}

// ============================================================================
// Main Sync Function
// ============================================================================

async function syncBible(force: boolean): Promise<void> {
  console.log('=== Bible Database Sync ===\n');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Check if database exists
  if (fs.existsSync(DB_PATH)) {
    if (force) {
      console.log('Force flag set, removing existing database...');
      fs.unlinkSync(DB_PATH);
    } else {
      console.log('Database already exists. Use --force to recreate.');
      return;
    }
  }

  // Create database
  console.log(`Creating database at ${DB_PATH}...`);
  const db = new Database(DB_PATH);

  // Apply schema
  console.log('Applying schema...');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  // Insert metadata
  db.run("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
  db.run(`INSERT INTO meta (key, value) VALUES ('created_at', '${new Date().toISOString()}')`);

  // Insert books
  console.log('Inserting books...');
  const insertBook = db.prepare(
    'INSERT INTO books (number, name, abbreviation, testament, chapters) VALUES (?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    for (const book of BOOKS) {
      insertBook.run(book.number, book.name, book.abbreviation, book.testament, book.chapters);
    }
  })();

  // Insert KJV version
  console.log('Inserting version info...');
  db.run(
    `INSERT INTO versions (code, name, language, year, copyright, is_default)
     VALUES ('KJV', 'King James Version', 'en', '1611/1769', 'Public Domain', 1)`,
  );

  // Load and insert verses
  const kjv = loadJson<KJVData>('kjv.json');
  console.log(`Inserting ${kjv.verses.length} verses...`);
  const insertVerse = db.prepare(
    'INSERT INTO verses (book, chapter, verse, version_code, text) VALUES (?, ?, ?, ?, ?)',
  );
  const VERSE_BATCH_SIZE = 1000;
  for (let i = 0; i < kjv.verses.length; i += VERSE_BATCH_SIZE) {
    const batch = kjv.verses.slice(i, i + VERSE_BATCH_SIZE);
    db.transaction(() => {
      for (const v of batch) {
        insertVerse.run(v.book, v.chapter, v.verse, 'KJV', v.text);
      }
    })();
    process.stdout.write(
      `\r  Progress: ${Math.min(i + VERSE_BATCH_SIZE, kjv.verses.length)}/${kjv.verses.length}`,
    );
  }
  console.log('\n');

  // Load and insert cross-references
  const crossRefs = loadJson<CrossRefsData>('cross-refs.json');
  const crossRefEntries = Object.entries(crossRefs);
  console.log(`Inserting cross-references for ${crossRefEntries.length} verses...`);
  const insertCrossRef = db.prepare(
    `INSERT OR IGNORE INTO cross_refs
     (book, chapter, verse, ref_book, ref_chapter, ref_verse, ref_verse_end, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'openbible')`,
  );
  let crossRefCount = 0;
  const CROSSREF_BATCH_SIZE = 2000;
  for (let i = 0; i < crossRefEntries.length; i += CROSSREF_BATCH_SIZE) {
    const batch = crossRefEntries.slice(i, i + CROSSREF_BATCH_SIZE);
    db.transaction(() => {
      for (const [key, data] of batch) {
        const source = parseVerseKey(key);
        if (source === null) continue;
        for (const ref of data.refs) {
          insertCrossRef.run(
            source.book,
            source.chapter,
            source.verse,
            ref.book,
            ref.chapter,
            ref.verse ?? null,
            ref.verseEnd ?? null,
          );
          crossRefCount++;
        }
      }
    })();
    process.stdout.write(
      `\r  Progress: ${Math.min(i + CROSSREF_BATCH_SIZE, crossRefEntries.length)}/${crossRefEntries.length}`,
    );
  }
  console.log(`\n  Inserted ${crossRefCount} cross-references (openbible)\n`);

  // Load and insert TSKe cross-references
  const tskeJsonPath = path.join(ASSETS_DIR, 'cross-refs-tske.json');
  if (fs.existsSync(tskeJsonPath)) {
    const tskeCrossRefs = loadJson<CrossRefsData>('cross-refs-tske.json');
    const tskeEntries = Object.entries(tskeCrossRefs);
    console.log(`Inserting TSKe cross-references for ${tskeEntries.length} verses...`);
    const insertTskeCrossRef = db.prepare(
      `INSERT OR IGNORE INTO cross_refs
       (book, chapter, verse, ref_book, ref_chapter, ref_verse, ref_verse_end, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'tske')`,
    );
    let tskeCount = 0;
    for (let i = 0; i < tskeEntries.length; i += CROSSREF_BATCH_SIZE) {
      const batch = tskeEntries.slice(i, i + CROSSREF_BATCH_SIZE);
      db.transaction(() => {
        for (const [key, data] of batch) {
          const source = parseVerseKey(key);
          if (source === null) continue;
          for (const ref of data.refs) {
            insertTskeCrossRef.run(
              source.book,
              source.chapter,
              source.verse,
              ref.book,
              ref.chapter,
              ref.verse ?? null,
              ref.verseEnd ?? null,
            );
            tskeCount++;
          }
        }
      })();
      process.stdout.write(
        `\r  Progress: ${Math.min(i + CROSSREF_BATCH_SIZE, tskeEntries.length)}/${tskeEntries.length}`,
      );
    }
    console.log(`\n  Inserted ${tskeCount} cross-references (tske)\n`);
  } else {
    console.log('Skipping TSKe cross-references (cross-refs-tske.json not found)\n');
  }

  // Report combined cross-ref count
  const totalCrossRefsRow = db
    .query<{ count: number }, []>('SELECT COUNT(*) as count FROM cross_refs')
    .get();
  console.log(`  Total cross-references in database: ${totalCrossRefsRow?.count ?? 0}\n`);

  // Load and insert Strong's definitions
  const strongs = loadJson<StrongsData>('strongs.json');
  const strongsEntries = Object.entries(strongs);
  console.log(`Inserting ${strongsEntries.length} Strong's definitions...`);
  const insertStrongs = db.prepare(
    `INSERT INTO strongs (number, language, lemma, transliteration, definition)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const STRONGS_BATCH_SIZE = 500;
  for (let i = 0; i < strongsEntries.length; i += STRONGS_BATCH_SIZE) {
    const batch = strongsEntries.slice(i, i + STRONGS_BATCH_SIZE);
    db.transaction(() => {
      for (const [num, data] of batch) {
        const language = num.startsWith('H') ? 'hebrew' : 'greek';
        insertStrongs.run(num.toUpperCase(), language, data.lemma, data.xlit ?? null, data.def);
      }
    })();
    process.stdout.write(
      `\r  Progress: ${Math.min(i + STRONGS_BATCH_SIZE, strongsEntries.length)}/${strongsEntries.length}`,
    );
  }
  console.log('\n');

  // Load and insert verse words with Strong's mappings
  const kjvStrongs = loadJson<KJVStrongsData>('kjv-strongs.json');
  console.log(`Inserting verse words for ${kjvStrongs.length} verses...`);
  const insertVerseWord = db.prepare(
    `INSERT INTO verse_words (book, chapter, verse, word_index, word_text, strongs_numbers)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertStrongsVerse = db.prepare(
    `INSERT OR IGNORE INTO strongs_verses (strongs_number, book, chapter, verse, word_text, word_index)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const WORDS_BATCH_SIZE = 200;
  let verseWordCount = 0;
  let strongsVerseCount = 0;
  for (let i = 0; i < kjvStrongs.length; i += WORDS_BATCH_SIZE) {
    const batch = kjvStrongs.slice(i, i + WORDS_BATCH_SIZE);
    db.transaction(() => {
      for (const verseData of batch) {
        for (let wordIdx = 0; wordIdx < verseData.words.length; wordIdx++) {
          const word = verseData.words[wordIdx];
          if (word === undefined) continue;
          const strongsJson = word.strongs !== undefined ? JSON.stringify(word.strongs) : null;
          insertVerseWord.run(
            verseData.book,
            verseData.chapter,
            verseData.verse,
            wordIdx,
            word.text,
            strongsJson,
          );
          verseWordCount++;

          // Build inverted index
          if (word.strongs !== undefined) {
            for (const num of word.strongs) {
              insertStrongsVerse.run(
                num.toUpperCase(),
                verseData.book,
                verseData.chapter,
                verseData.verse,
                word.text,
                wordIdx,
              );
              strongsVerseCount++;
            }
          }
        }
      }
    })();
    process.stdout.write(
      `\r  Progress: ${Math.min(i + WORDS_BATCH_SIZE, kjvStrongs.length)}/${kjvStrongs.length}`,
    );
  }
  console.log(
    `\n  Inserted ${verseWordCount} verse words, ${strongsVerseCount} Strong's references\n`,
  );

  // Load and insert margin notes
  const marginNotes = loadJson<MarginNotesData>('margin-notes.json');
  const marginNoteEntries = Object.entries(marginNotes);
  console.log(`Inserting margin notes for ${marginNoteEntries.length} verses...`);
  const insertMarginNote = db.prepare(
    `INSERT INTO margin_notes (book, chapter, verse, note_index, note_type, phrase, note_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  let marginNoteCount = 0;
  const NOTES_BATCH_SIZE = 500;
  for (let i = 0; i < marginNoteEntries.length; i += NOTES_BATCH_SIZE) {
    const batch = marginNoteEntries.slice(i, i + NOTES_BATCH_SIZE);
    db.transaction(() => {
      for (const [key, notes] of batch) {
        const source = parseVerseKey(key);
        if (source === null) continue;
        for (let noteIdx = 0; noteIdx < notes.length; noteIdx++) {
          const note = notes[noteIdx];
          if (note === undefined) continue;
          insertMarginNote.run(
            source.book,
            source.chapter,
            source.verse,
            noteIdx,
            note.type,
            note.phrase,
            note.text,
          );
          marginNoteCount++;
        }
      }
    })();
    process.stdout.write(
      `\r  Progress: ${Math.min(i + NOTES_BATCH_SIZE, marginNoteEntries.length)}/${marginNoteEntries.length}`,
    );
  }
  console.log(`\n  Inserted ${marginNoteCount} margin notes\n`);

  // Populate FTS tables
  console.log('Building FTS indexes...');
  db.exec(`
    INSERT INTO verses_fts(rowid, text, book, chapter, verse, version_code)
    SELECT rowid, text, book, chapter, verse, version_code FROM verses;
  `);
  db.exec(`
    INSERT INTO strongs_fts(rowid, lemma, definition, kjv_definition, number)
    SELECT rowid, lemma, definition, kjv_definition, number FROM strongs;
  `);
  db.exec(`
    INSERT INTO margin_notes_fts(rowid, note_text, phrase, book, chapter, verse)
    SELECT rowid, note_text, phrase, book, chapter, verse FROM margin_notes;
  `);

  // Optimize
  console.log('Optimizing database...');
  db.exec('VACUUM');
  db.exec('ANALYZE');

  // Close database
  db.close();

  // Copy to runtime location (~/.bible/bible.db)
  const homeDir = process.env.HOME ?? process.env.USERPROFILE;
  if (homeDir !== undefined) {
    const runtimeDir = path.join(homeDir, '.bible');
    const runtimeDbPath = path.join(runtimeDir, 'bible.db');
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }
    fs.copyFileSync(DB_PATH, runtimeDbPath);
    console.log(`\nCopied to runtime location: ${runtimeDbPath}`);
  }

  // Report final size
  const stats = fs.statSync(DB_PATH);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`\n=== Sync Complete ===`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Size: ${sizeMB} MB`);
}

export { syncBible };

// ============================================================================
// CLI Entry Point (when run directly)
// ============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  syncBible(force).catch((err) => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
}
