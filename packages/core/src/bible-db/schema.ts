import { Effect } from 'effect';
import type * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

/** Canonical unified Bible schema, shared by desktop initialization and sync tooling. */
export const BIBLE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS books (
    number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    testament TEXT NOT NULL CHECK(testament IN ('old', 'new')),
    chapters INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS versions (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    year TEXT,
    copyright TEXT,
    is_default INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS verses (
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    version_code TEXT NOT NULL DEFAULT 'KJV',
    text TEXT NOT NULL,
    PRIMARY KEY (version_code, book, chapter, verse)
  )`,
  `CREATE TABLE IF NOT EXISTS cross_refs (
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    ref_book INTEGER NOT NULL,
    ref_chapter INTEGER NOT NULL,
    ref_verse INTEGER,
    ref_verse_end INTEGER,
    source TEXT NOT NULL CHECK(source IN ('openbible', 'tske')),
    preview_text TEXT,
    PRIMARY KEY (book, chapter, verse, ref_book, ref_chapter, ref_verse, source)
  )`,
  `CREATE TABLE IF NOT EXISTS strongs (
    number TEXT PRIMARY KEY,
    language TEXT NOT NULL CHECK(language IN ('hebrew', 'greek')),
    lemma TEXT NOT NULL,
    transliteration TEXT,
    pronunciation TEXT,
    definition TEXT NOT NULL,
    kjv_definition TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS verse_words (
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    word_index INTEGER NOT NULL,
    word_text TEXT NOT NULL,
    strongs_numbers TEXT,
    PRIMARY KEY (book, chapter, verse, word_index)
  )`,
  `CREATE TABLE IF NOT EXISTS strongs_verses (
    strongs_number TEXT NOT NULL,
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    word_text TEXT,
    word_index INTEGER NOT NULL,
    PRIMARY KEY (strongs_number, book, chapter, verse, word_index)
  )`,
  `CREATE TABLE IF NOT EXISTS margin_notes (
    book INTEGER NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    note_index INTEGER NOT NULL,
    note_type TEXT NOT NULL CHECK(note_type IN ('hebrew', 'greek', 'alternate', 'name', 'other')),
    phrase TEXT NOT NULL,
    note_text TEXT NOT NULL,
    PRIMARY KEY (book, chapter, verse, note_index)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_verses_book_chapter ON verses(version_code, book, chapter)`,
  `CREATE INDEX IF NOT EXISTS idx_cross_refs_source ON cross_refs(book, chapter, verse)`,
  `CREATE INDEX IF NOT EXISTS idx_strongs_verses_number ON strongs_verses(strongs_number)`,
  `CREATE INDEX IF NOT EXISTS idx_verse_words_verse ON verse_words(book, chapter, verse)`,
  `CREATE INDEX IF NOT EXISTS idx_margin_notes_verse ON margin_notes(book, chapter, verse)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text, book UNINDEXED, chapter UNINDEXED, verse UNINDEXED, version_code UNINDEXED,
    content=verses, content_rowid=rowid, tokenize='unicode61 remove_diacritics 1'
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS strongs_fts USING fts5(
    lemma, definition, kjv_definition, number UNINDEXED,
    content=strongs, content_rowid=rowid, tokenize='unicode61 remove_diacritics 1'
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS margin_notes_fts USING fts5(
    note_text, phrase, book UNINDEXED, chapter UNINDEXED, verse UNINDEXED,
    content=margin_notes, content_rowid=rowid, tokenize='unicode61 remove_diacritics 1'
  )`,
  `CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
    INSERT INTO verses_fts(rowid, text, book, chapter, verse, version_code)
    VALUES (new.rowid, new.text, new.book, new.chapter, new.verse, new.version_code);
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text, book, chapter, verse, version_code)
    VALUES ('delete', old.rowid, old.text, old.book, old.chapter, old.verse, old.version_code);
  END`,
  `CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE ON verses BEGIN
    INSERT INTO verses_fts(verses_fts, rowid, text, book, chapter, verse, version_code)
    VALUES ('delete', old.rowid, old.text, old.book, old.chapter, old.verse, old.version_code);
    INSERT INTO verses_fts(rowid, text, book, chapter, verse, version_code)
    VALUES (new.rowid, new.text, new.book, new.chapter, new.verse, new.version_code);
  END`,
  `CREATE TRIGGER IF NOT EXISTS strongs_ai AFTER INSERT ON strongs BEGIN
    INSERT INTO strongs_fts(rowid, lemma, definition, kjv_definition, number)
    VALUES (new.rowid, new.lemma, new.definition, new.kjv_definition, new.number);
  END`,
  `CREATE TRIGGER IF NOT EXISTS strongs_ad AFTER DELETE ON strongs BEGIN
    INSERT INTO strongs_fts(strongs_fts, rowid, lemma, definition, kjv_definition, number)
    VALUES ('delete', old.rowid, old.lemma, old.definition, old.kjv_definition, old.number);
  END`,
  `CREATE TRIGGER IF NOT EXISTS strongs_au AFTER UPDATE ON strongs BEGIN
    INSERT INTO strongs_fts(strongs_fts, rowid, lemma, definition, kjv_definition, number)
    VALUES ('delete', old.rowid, old.lemma, old.definition, old.kjv_definition, old.number);
    INSERT INTO strongs_fts(rowid, lemma, definition, kjv_definition, number)
    VALUES (new.rowid, new.lemma, new.definition, new.kjv_definition, new.number);
  END`,
  `CREATE TRIGGER IF NOT EXISTS margin_notes_ai AFTER INSERT ON margin_notes BEGIN
    INSERT INTO margin_notes_fts(rowid, note_text, phrase, book, chapter, verse)
    VALUES (new.rowid, new.note_text, new.phrase, new.book, new.chapter, new.verse);
  END`,
  `CREATE TRIGGER IF NOT EXISTS margin_notes_ad AFTER DELETE ON margin_notes BEGIN
    INSERT INTO margin_notes_fts(margin_notes_fts, rowid, note_text, phrase, book, chapter, verse)
    VALUES ('delete', old.rowid, old.note_text, old.phrase, old.book, old.chapter, old.verse);
  END`,
  `CREATE TRIGGER IF NOT EXISTS margin_notes_au AFTER UPDATE ON margin_notes BEGIN
    INSERT INTO margin_notes_fts(margin_notes_fts, rowid, note_text, phrase, book, chapter, verse)
    VALUES ('delete', old.rowid, old.note_text, old.phrase, old.book, old.chapter, old.verse);
    INSERT INTO margin_notes_fts(rowid, note_text, phrase, book, chapter, verse)
    VALUES (new.rowid, new.note_text, new.phrase, new.book, new.chapter, new.verse);
  END`,
] as const;

export const initializeBibleSchema = (sql: SqlClient.SqlClient): Effect.Effect<void, SqlError> =>
  Effect.forEach(BIBLE_SCHEMA_STATEMENTS, (statement) => sql.unsafe(statement), {
    discard: true,
  });
