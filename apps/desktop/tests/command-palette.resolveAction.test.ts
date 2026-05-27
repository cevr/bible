/**
 * Pure-function tests for the command palette's row → action resolver.
 *
 * Locks the activation rules down without instantiating SolidJS, the IPC
 * runtime, or the DOM. Every UI dispatch path funnels through
 * `resolveAction` / `resolveParsedAction`, so the assertions here cover the
 * navigation contract the palette publishes to the rest of the app.
 */

import {
  type ParsedBibleQuery,
  ParsedBibleQueryConstructors,
  parseBibleQuery,
} from '@bible/core/bible-reader';
import { describe, expect, it } from 'vitest';
import { resolveAction, resolveParsedAction, type Row } from '../src/components/command-palette.js';

const bookRow = (book: number): Row => ({
  kind: 'book',
  id: `book-${String(book)}`,
  book,
  label: `Book ${String(book)}`,
});

const chapterRow = (book: number, chapter: number): Row => ({
  kind: 'chapter',
  id: `ch-${String(book)}-${String(chapter)}`,
  book,
  chapter,
  label: `${String(book)}:${String(chapter)}`,
});

const verseRow = (book: number, chapter: number, verse: number): Row => ({
  kind: 'verse',
  id: `v-${String(book)}-${String(chapter)}-${String(verse)}`,
  book,
  chapter,
  verse,
  label: `${String(book)}:${String(chapter)}:${String(verse)}`,
});

const parsedRow = (parsed: ParsedBibleQuery): Row => ({
  kind: 'parsed',
  id: 'parsed',
  parsed,
  label: 'parsed',
  hint: 'preview',
});

describe('resolveAction (row kinds)', () => {
  it('book row drills into the book view', () => {
    expect(resolveAction(bookRow(43))).toEqual({
      kind: 'drilldown',
      view: { _tag: 'book', book: 43 },
    });
  });

  it('chapter row opens the chapter without a verse anchor', () => {
    expect(resolveAction(chapterRow(43, 3))).toEqual({
      kind: 'openChapter',
      book: 43,
      chapter: 3,
    });
  });

  it('verse row opens the chapter at the verse anchor', () => {
    expect(resolveAction(verseRow(43, 3, 16))).toEqual({
      kind: 'openChapterAt',
      book: 43,
      chapter: 3,
      verse: 16,
    });
  });
});

describe('resolveParsedAction', () => {
  it('single ref opens the chapter at that verse', () => {
    const parsed = parseBibleQuery('john 3:16');
    // Sanity-check the parser landed on `single` so the test stays
    // meaningful when parse.ts evolves.
    expect(parsed._tag).toBe('single');
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'openChapterAt',
      book: 43,
      chapter: 3,
      verse: 16,
    });
  });

  it('verse range opens at the start verse (no range concept in the reader)', () => {
    const parsed = parseBibleQuery('john 3:16-18');
    expect(parsed._tag).toBe('verseRange');
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'openChapterAt',
      book: 43,
      chapter: 3,
      verse: 16,
    });
  });

  it('single chapter opens the chapter without an anchor', () => {
    const parsed = parseBibleQuery('john 3');
    expect(parsed._tag).toBe('chapter');
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'openChapter',
      book: 43,
      chapter: 3,
    });
  });

  it('chapter range opens the start chapter', () => {
    const parsed = parseBibleQuery('john 3-5');
    expect(parsed._tag).toBe('chapterRange');
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'openChapter',
      book: 43,
      chapter: 3,
    });
  });

  it('full book drills into the book view (chapter picker)', () => {
    const parsed = parseBibleQuery('ruth');
    expect(parsed._tag).toBe('fullBook');
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'drilldown',
      view: { _tag: 'book', book: 8 },
    });
  });

  it('falls back to openChapter when a single ref has no verse', () => {
    // Synthetic — guards the schema-loosening branch in the resolver.
    const parsed = ParsedBibleQueryConstructors.single({ book: 43, chapter: 3 });
    expect(resolveParsedAction(parsed)).toEqual({
      kind: 'openChapter',
      book: 43,
      chapter: 3,
    });
  });

  it('search parses return null (rows filter them out before activation)', () => {
    const parsed = parseBibleQuery('faith hope love');
    expect(parsed._tag).toBe('search');
    expect(resolveParsedAction(parsed)).toBeNull();
  });
});

describe('resolveAction (parsed rows funnel through resolveParsedAction)', () => {
  it('a parsed verseRange row activates as openChapterAt at startVerse', () => {
    const parsed = parseBibleQuery('1 cor 13:1-5');
    expect(parsed._tag).toBe('verseRange');
    expect(resolveAction(parsedRow(parsed))).toEqual({
      kind: 'openChapterAt',
      book: 46,
      chapter: 13,
      verse: 1,
    });
  });

  it('a parsed fullBook row activates as a drilldown into that book', () => {
    const parsed = parseBibleQuery('genesis');
    expect(parsed._tag).toBe('fullBook');
    expect(resolveAction(parsedRow(parsed))).toEqual({
      kind: 'drilldown',
      view: { _tag: 'book', book: 1 },
    });
  });
});
