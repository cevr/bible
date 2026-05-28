#!/usr/bin/env bun
// One-shot extractor: pull anchor passages from kjv.json and emit verbatim markdown.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Verse = { book_name: string; book: number; chapter: number; verse: number; text: string };
type Kjv = { verses: Verse[] };

const kjv =
  require('/Users/cvr/Developer/personal/bible-tools/packages/core/assets/kjv.json') as Kjv;

const passages: Array<{
  heading: string;
  ref: string;
  book: string;
  chapter: number;
  verses?: [number, number];
}> = [
  {
    heading: 'Genesis 3 — Eden, fig leaves, coats of skins',
    ref: 'Gen 3',
    book: 'Genesis',
    chapter: 3,
  },
  {
    heading: 'Exodus 28:40-43 — Priestly garments, linen breeches',
    ref: 'Ex 28:40-43',
    book: 'Exodus',
    chapter: 28,
    verses: [40, 43],
  },
  {
    heading: 'Exodus 20:26 — No nakedness on the altar',
    ref: 'Ex 20:26',
    book: 'Exodus',
    chapter: 20,
    verses: [26, 26],
  },
  {
    heading: 'Leviticus 18:6-19 — Uncovering of nakedness (legal definition)',
    ref: 'Lev 18:6-19',
    book: 'Leviticus',
    chapter: 18,
    verses: [6, 19],
  },
  {
    heading: 'Isaiah 3:16-26 — Daughters of Zion stripped of their ornaments',
    ref: 'Isa 3:16-26',
    book: 'Isaiah',
    chapter: 3,
    verses: [16, 26],
  },
  {
    heading: 'Isaiah 47:1-3 — Daughter of Babylon uncovered',
    ref: 'Isa 47:1-3',
    book: 'Isaiah',
    chapter: 47,
    verses: [1, 3],
  },
  {
    heading: 'Isaiah 61:10 — Garments of salvation, robe of righteousness',
    ref: 'Isa 61:10',
    book: 'Isaiah',
    chapter: 61,
    verses: [10, 10],
  },
  {
    heading: 'Jeremiah 13:22, 26 — Skirts discovered, heels made bare',
    ref: 'Jer 13:22, 26',
    book: 'Jeremiah',
    chapter: 13,
    verses: [22, 26],
  },
  {
    heading: 'Ezekiel 16:8-14 — Yahweh covers Jerusalem',
    ref: 'Ezk 16:8-14',
    book: 'Ezekiel',
    chapter: 16,
    verses: [8, 14],
  },
  {
    heading: 'Zephaniah 1:8 — Princes clothed with strange apparel',
    ref: 'Zeph 1:8',
    book: 'Zephaniah',
    chapter: 1,
    verses: [8, 8],
  },
  {
    heading: 'Matthew 22:11-14 — Without a wedding garment',
    ref: 'Mt 22:11-14',
    book: 'Matthew',
    chapter: 22,
    verses: [11, 14],
  },
  {
    heading: '1 Timothy 2:9-10 — Modest apparel, shamefacedness, sobriety',
    ref: '1 Tim 2:9-10',
    book: '1 Timothy',
    chapter: 2,
    verses: [9, 10],
  },
  {
    heading: '1 Peter 3:3-5 — Hidden man of the heart, not outward adorning',
    ref: '1 Pet 3:3-5',
    book: '1 Peter',
    chapter: 3,
    verses: [3, 5],
  },
  {
    heading: 'Revelation 3:17-18 — Wretched, naked, white raiment',
    ref: 'Rev 3:17-18',
    book: 'Revelation',
    chapter: 3,
    verses: [17, 18],
  },
  {
    heading: 'Revelation 12:1 — Woman clothed with the sun',
    ref: 'Rev 12:1',
    book: 'Revelation',
    chapter: 12,
    verses: [1, 1],
  },
  {
    heading: 'Revelation 17:3-6 — Woman in scarlet, decked with gold and pearls',
    ref: 'Rev 17:3-6',
    book: 'Revelation',
    chapter: 17,
    verses: [3, 6],
  },
  {
    heading: 'Revelation 19:7-8 — Bride arrayed in fine linen',
    ref: 'Rev 19:7-8',
    book: 'Revelation',
    chapter: 19,
    verses: [7, 8],
  },
  {
    heading: 'Deuteronomy 22:5 — Distinction between man and woman in apparel',
    ref: 'Dt 22:5',
    book: 'Deuteronomy',
    chapter: 22,
    verses: [5, 5],
  },
];

const lines: string[] = [
  '# Dress Reform — Anchor Passages (KJV verbatim)',
  '',
  'Source: `packages/core/assets/kjv.json`  ',
  'Compiled: 2026-05-27',
  '',
  'Bracketed words `[was]` are KJV translator-supplied italics. ¶ marks paragraph breaks in the KJV source.',
  '',
  '---',
  '',
];

for (const p of passages) {
  lines.push(`## ${p.heading}`);
  lines.push('');
  const matched = kjv.verses.filter((v) => {
    if (v.book_name !== p.book) return false;
    if (v.chapter !== p.chapter) return false;
    if (p.verses) {
      const [lo, hi] = p.verses;
      return v.verse >= lo && v.verse <= hi;
    }
    return true;
  });
  if (matched.length === 0) {
    lines.push(`_(no verses matched ${p.ref} — book name mismatch?)_`);
    lines.push('');
  } else {
    for (const v of matched) {
      lines.push(`**${v.verse}** ${v.text}`);
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
}

const out = resolve(
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/dress-reform/reference/anchor-passages.md',
);
writeFileSync(out, lines.join('\n'));
console.log(`wrote ${out} (${passages.length} passages, ${lines.length} lines)`);
