#!/usr/bin/env bun
/**
 * Convert CrossWire KJV2006 OSIS XML -> kjv-strongs.json
 *
 * Why: our bundled `assets/kjv-strongs.json` is missing 21 of 66 books
 * (1-2 Sam, 1-2 Kgs, 1-2 Chr, Isa, Mark, Acts, 1-2 Cor, 1-2 Thess, 1-2 Tim,
 * Phlm, 1-2 Pet, 1-3 John). The CrossWire KJV2006 OSIS file has full
 * coverage and is the canonical upstream for every public-domain "KJV with
 * Strong's" derivative. Output matches the existing target shape so it's
 * a drop-in replacement for `assets/kjv-strongs.json` and `bible-sync.ts`
 * needs no changes.
 *
 * Source:   http://www.crosswire.org/~dmsmith/kjv2006/sword/kjvxml.zip
 *           (kjv.xml inside, ~25MB)
 * License:  Public Domain (KJV text) + CC BY (KJV2003 Project Strong's
 *           tagging by CrossWire Bible Society)
 *
 * Usage:
 *   bun run scripts/convert-osis-to-kjv-strongs.ts <path-to-kjv.xml>
 *   # writes to packages/core/assets/kjv-strongs.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// OSIS book IDs -> our canonical 1-66 numbering (KJV ordering, matches
// packages/core/src/sync/bible-sync.ts BOOKS array)
const BOOK_NUMBER: Record<string, number> = {
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

interface Word {
  text: string;
  strongs?: string[];
  // True for translator-supplied words — KJV italics, encoded in OSIS as
  // <transChange type="added">. The renderer styles these like the plain
  // reader's italics. Omitted (not `false`) for ordinary words to keep the
  // asset small.
  italic?: boolean;
}

interface OutVerse {
  book: number;
  chapter: number;
  verse: number;
  words: Word[];
}

// OSIS encodes Strong's as `strong:H07225` / `strong:G2316`. Our target
// strips leading zeros from the numeric portion (H07225 -> H7225, H0853 ->
// H853) while keeping the H/G prefix and not touching the digits' magnitude.
function normalizeStrong(raw: string): string | null {
  const m = raw.match(/^strong:([HG])0*(\d+)$/);
  if (m === null) return null;
  return `${m[1]}${m[2]}`;
}

// Parse a verse body (the OSIS content between <verse sID> and <verse eID>)
// into the target word array.
//
// OSIS shape we handle:
//   <w lemma="strong:H08064 strong:H01254">phrase here</w>
//     -> split phrase by whitespace; LAST word inherits the strongs[],
//        earlier words become bare {text}.
//   <transChange type="added">word</transChange>
//     -> bare {text} (italicized KJV translator addition).
//   Free text between tags
//     -> this is REAL verse text too (e.g. "Behold, thou " at the start of
//        Song 4:1, or "; behold, thou " between two <w> groups). It is NOT
//        just punctuation: tokenize it. A leading run of punctuation with no
//        preceding space ("," / ";" / ":") attaches to the previous word;
//        remaining whitespace-separated tokens become their own bare {text}.
//
// We strip <note>/<title> blocks (with their inner text) BEFORE walking —
// their content is translator apparatus ("Heb. ...", "or, ...") that the
// CrossWire OSIS appends inline, and absorbing it into the verse was the
// source of the "Gilead.that…:or,thateatof,etc" corruption. Other inline
// markup (<divineName>, <foreign>, <q>, <seg>, <milestone>) is discarded
// tag-wise but its text is kept, since it carries real verse words.
export function parseVerseBody(rawBody: string): Word[] {
  const words: Word[] = [];

  // Drop translator-apparatus blocks entirely (tag + inner text, including
  // any nested markup like <divineName> inside a note). These never contain
  // <w> Strong's words, so nothing meaningful is lost.
  const body = rawBody
    .replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, ' ')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, ' ');

  // Walk the body left-to-right, alternating between tag matches and the
  // raw text between them. We use a single regex that matches <w>, </w>,
  // <transChange>, </transChange>, or any other self-closing/empty tag
  // (which we discard).
  const TOKEN = /<w\s[^>]*>|<\/w>|<transChange[^>]*>|<\/transChange>|<[^>]+>/g;
  let cursor = 0;
  let mode: 'none' | 'w' | 'added' = 'none';
  let wStrongs: string[] | undefined;
  let openText = ''; // accumulated raw text since last <w> / <transChange> open
  let m: RegExpExecArray | null;

  // Emit free text found between tags in 'none' mode. This text is real verse
  // content. A leading punctuation run with NO preceding whitespace cleaves to
  // the previous word ("fair" + ", " -> "fair,"); everything after the first
  // whitespace becomes standalone bare words ("; behold, thou " -> previous
  // word gets ";", then "behold," and "thou" are pushed as their own tokens).
  const emitFreeText = (raw: string): void => {
    if (raw === '') return;
    // Attach a leading no-space punctuation run to the previous word.
    if (words.length > 0) {
      const lead = raw.match(/^[^\s]+/);
      if (lead !== null && !/^\s/.test(raw)) {
        words[words.length - 1]!.text += lead[0];
        raw = raw.slice(lead[0].length);
      }
    }
    // Remaining whitespace-separated tokens are their own words.
    for (const tok of raw.split(/\s+/)) {
      if (tok !== '') words.push({ text: tok });
    }
  };

  const flushWGroup = (raw: string): void => {
    // Split the phrase on whitespace; last token carries the strongs[].
    const tokens = raw.split(/\s+/).filter((s) => s !== '');
    if (tokens.length === 0) return;
    for (let i = 0; i < tokens.length - 1; i++) {
      words.push({ text: tokens[i]! });
    }
    const lastTok = tokens[tokens.length - 1]!;
    if (wStrongs !== undefined && wStrongs.length > 0) {
      words.push({ text: lastTok, strongs: wStrongs });
    } else {
      words.push({ text: lastTok });
    }
  };

  const flushAddedGroup = (raw: string): void => {
    const tokens = raw.split(/\s+/).filter((s) => s !== '');
    for (const t of tokens) words.push({ text: t, italic: true });
  };

  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(body)) !== null) {
    const between = body.slice(cursor, m.index);
    cursor = m.index + m[0].length;

    if (mode === 'w' || mode === 'added') {
      openText += between;
    } else {
      // We're in 'none' mode: this between-text is real verse text (leading
      // free text, or words/punctuation between <w>/<transChange> groups).
      emitFreeText(between);
    }

    const tag = m[0];
    if (tag.startsWith('<w ')) {
      // Open <w>: collect strong:* lemmas.
      const lemmaMatch = tag.match(/lemma="([^"]*)"/);
      wStrongs = undefined;
      if (lemmaMatch !== null) {
        const parts = lemmaMatch[1]!.split(/\s+/);
        const norm: string[] = [];
        for (const p of parts) {
          const n = normalizeStrong(p);
          if (n !== null) norm.push(n);
        }
        if (norm.length > 0) wStrongs = norm;
      }
      mode = 'w';
      openText = '';
    } else if (tag === '</w>') {
      flushWGroup(openText);
      mode = 'none';
      openText = '';
      wStrongs = undefined;
    } else if (tag.startsWith('<transChange')) {
      mode = 'added';
      openText = '';
    } else if (tag === '</transChange>') {
      flushAddedGroup(openText);
      mode = 'none';
      openText = '';
    }
    // Other tags (milestone, note, chapter, etc.) are discarded; their
    // text content gets absorbed into the surrounding 'none'-mode tail.
  }

  // Trailing text after the last tag (often the verse-final period).
  const trailing = body.slice(cursor);
  if (mode === 'none') emitFreeText(trailing);

  return words;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function convert(osisPath: string, outPath: string): void {
  console.log(`Reading ${osisPath}...`);
  const xml = fs.readFileSync(osisPath, 'utf-8');
  console.log(`  ${xml.length.toLocaleString()} bytes`);

  // Match every verse: <verse osisID="Book.C.V" sID="..."/> ... <verse eID="Book.C.V"/>
  const VERSE = /<verse osisID="([^"]+)" sID="[^"]*"\/>([\s\S]*?)<verse eID="\1"\/>/g;
  const out: OutVerse[] = [];
  const skipped: string[] = [];
  let count = 0;

  let m: RegExpExecArray | null;
  while ((m = VERSE.exec(xml)) !== null) {
    const osisID = m[1]!;
    const body = m[2]!;
    const parts = osisID.split('.');
    if (parts.length !== 3) {
      skipped.push(osisID);
      continue;
    }
    const [bookOsis, chapStr, verseStr] = parts as [string, string, string];
    const bookNum = BOOK_NUMBER[bookOsis];
    if (bookNum === undefined) {
      skipped.push(osisID);
      continue;
    }
    const words = parseVerseBody(decodeEntities(body));
    out.push({
      book: bookNum,
      chapter: parseInt(chapStr, 10),
      verse: parseInt(verseStr, 10),
      words,
    });
    count++;
    if (count % 5000 === 0) console.log(`  parsed ${count} verses...`);
  }

  // Sanity: confirm all 66 books present.
  const books = new Set(out.map((v) => v.book));
  const missing = Array.from({ length: 66 }, (_, i) => i + 1).filter((b) => !books.has(b));
  if (missing.length > 0) {
    console.error(`\nERROR: missing books from output: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Sort to match canonical iteration order (book, chapter, verse).
  out.sort((a, b) =>
    a.book !== b.book
      ? a.book - b.book
      : a.chapter !== b.chapter
        ? a.chapter - b.chapter
        : a.verse - b.verse,
  );

  console.log(`Writing ${out.length.toLocaleString()} verses to ${outPath}...`);
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`  ${fs.statSync(outPath).size.toLocaleString()} bytes`);
  if (skipped.length > 0) console.log(`  skipped ${skipped.length} unrecognised osisIDs`);
}

// Only run the CLI conversion when invoked directly — keep `parseVerseBody`
// importable from tests without triggering a file read/write.
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('usage: convert-osis-to-kjv-strongs.ts <path-to-kjv.xml> [output-path]');
    process.exit(1);
  }
  const inPath = args[0]!;
  const outPath = args[1] ?? path.resolve(import.meta.dir, '../assets/kjv-strongs.json');
  convert(inPath, outPath);
}
