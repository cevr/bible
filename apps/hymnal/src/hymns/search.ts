/**
 * Search by number, title or first line.
 *
 * A query of digits finds that hymn first, then every hymn whose number
 * starts with them ("1" gives 1, then 10–19, 100–199). A query of words finds
 * the hymns whose title or first line holds every word, the last one as a
 * prefix while it is typed; title matches come before first-line matches,
 * then number order. Case, accents and punctuation are ignored ("o'er" finds
 * "O’er"). An empty query lists every hymn.
 */

import type { HymnText } from './text';

/** Lower case, accents dropped, apostrophes joined, other punctuation a space. */
export const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

interface Entry {
  readonly hymn: HymnText;
  readonly number: string;
  readonly title: ReadonlyArray<string>;
  readonly firstLine: ReadonlyArray<string>;
}

export interface SearchIndex {
  readonly entries: ReadonlyArray<Entry>;
}

const words = (text: string) => fold(text).split(' ').filter(Boolean);

export const indexOf = (hymns: ReadonlyArray<HymnText>): SearchIndex => ({
  entries: hymns.map((hymn) => ({
    hymn,
    number: String(hymn.number),
    title: words(hymn.title),
    firstLine: words(hymn.firstLine),
  })),
});

/** Every query word is a word of `have`; the last may be a prefix of one. */
const holds = (have: ReadonlyArray<string>, query: ReadonlyArray<string>) =>
  query.every(
    (word, k) =>
      have.includes(word) || (k === query.length - 1 && have.some((w) => w.startsWith(word))),
  );

export const search = (index: SearchIndex, query: string): ReadonlyArray<HymnText> => {
  const folded = fold(query);
  if (folded === '') return index.entries.map((e) => e.hymn);
  if (/^\d+$/.test(folded)) {
    const digits = String(Number(folded));
    const exact = index.entries.filter((e) => e.number === digits);
    const prefix = index.entries.filter((e) => e.number !== digits && e.number.startsWith(digits));
    return [...exact, ...prefix].map((e) => e.hymn);
  }
  const terms = folded.split(' ');
  const byTitle: HymnText[] = [];
  const byLine: HymnText[] = [];
  for (const e of index.entries) {
    if (holds(e.title, terms)) byTitle.push(e.hymn);
    else if (holds([...e.title, ...e.firstLine], terms)) byLine.push(e.hymn);
  }
  return [...byTitle, ...byLine];
};
