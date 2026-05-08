/**
 * Bible Books Data
 *
 * Static data for all 66 books of the Bible.
 * Renderer-agnostic - can be used by TUI, Web, or CLI.
 */

import type { BibleBook } from './types.js';

/**
 * Book name aliases for reference parsing
 * Maps lowercase aliases to book numbers (1-66)
 */
export const BIBLE_BOOK_ALIASES: Record<string, number> = {
  // Genesis
  gen: 1,
  genesis: 1,
  // Exodus
  exod: 2,
  exodus: 2,
  ex: 2,
  // Leviticus
  lev: 3,
  leviticus: 3,
  // Numbers
  num: 4,
  numbers: 4,
  // Deuteronomy
  deut: 5,
  deuteronomy: 5,
  // Joshua
  josh: 6,
  joshua: 6,
  // Judges
  judg: 7,
  judges: 7,
  // Ruth
  ruth: 8,
  // 1 Samuel
  '1sam': 9,
  '1samuel': 9,
  '1 sam': 9,
  '1 samuel': 9,
  // 2 Samuel
  '2sam': 10,
  '2samuel': 10,
  '2 sam': 10,
  '2 samuel': 10,
  // 1 Kings
  '1kgs': 11,
  '1kings': 11,
  '1 kgs': 11,
  '1 kings': 11,
  // 2 Kings
  '2kgs': 12,
  '2kings': 12,
  '2 kgs': 12,
  '2 kings': 12,
  // 1 Chronicles
  '1chr': 13,
  '1chronicles': 13,
  '1 chr': 13,
  '1 chronicles': 13,
  '1 chron': 13,
  // 2 Chronicles
  '2chr': 14,
  '2chronicles': 14,
  '2 chr': 14,
  '2 chronicles': 14,
  '2 chron': 14,
  // Ezra
  ezra: 15,
  // Nehemiah
  neh: 16,
  nehemiah: 16,
  // Esther
  esth: 17,
  esther: 17,
  // Job
  job: 18,
  // Psalms
  ps: 19,
  psalm: 19,
  psalms: 19,
  psa: 19,
  // Proverbs
  prov: 20,
  proverbs: 20,
  // Ecclesiastes
  eccl: 21,
  ecclesiastes: 21,
  ecc: 21,
  // Song of Solomon
  song: 22,
  'song of solomon': 22,
  sos: 22,
  'song of songs': 22,
  // Isaiah
  isa: 23,
  isaiah: 23,
  // Jeremiah
  jer: 24,
  jeremiah: 24,
  // Lamentations
  lam: 25,
  lamentations: 25,
  // Ezekiel
  ezek: 26,
  ezekiel: 26,
  // Daniel
  dan: 27,
  daniel: 27,
  // Hosea
  hos: 28,
  hosea: 28,
  // Joel
  joel: 29,
  // Amos
  amos: 30,
  // Obadiah
  obad: 31,
  obadiah: 31,
  // Jonah
  jonah: 32,
  // Micah
  mic: 33,
  micah: 33,
  // Nahum
  nah: 34,
  nahum: 34,
  // Habakkuk
  hab: 35,
  habakkuk: 35,
  // Zephaniah
  zeph: 36,
  zephaniah: 36,
  // Haggai
  hag: 37,
  haggai: 37,
  // Zechariah
  zech: 38,
  zechariah: 38,
  // Malachi
  mal: 39,
  malachi: 39,
  // Matthew
  matt: 40,
  matthew: 40,
  mt: 40,
  // Mark
  mark: 41,
  mk: 41,
  // Luke
  luke: 42,
  lk: 42,
  // John
  john: 43,
  jn: 43,
  // Acts
  acts: 44,
  // Romans
  rom: 45,
  romans: 45,
  // 1 Corinthians
  '1cor': 46,
  '1corinthians': 46,
  '1 cor': 46,
  '1 corinthians': 46,
  // 2 Corinthians
  '2cor': 47,
  '2corinthians': 47,
  '2 cor': 47,
  '2 corinthians': 47,
  // Galatians
  gal: 48,
  galatians: 48,
  // Ephesians
  eph: 49,
  ephesians: 49,
  // Philippians
  phil: 50,
  philippians: 50,
  // Colossians
  col: 51,
  colossians: 51,
  // 1 Thessalonians
  '1thess': 52,
  '1thessalonians': 52,
  '1 thess': 52,
  '1 thessalonians': 52,
  // 2 Thessalonians
  '2thess': 53,
  '2thessalonians': 53,
  '2 thess': 53,
  '2 thessalonians': 53,
  // 1 Timothy
  '1tim': 54,
  '1timothy': 54,
  '1 tim': 54,
  '1 timothy': 54,
  // 2 Timothy
  '2tim': 55,
  '2timothy': 55,
  '2 tim': 55,
  '2 timothy': 55,
  // Titus
  titus: 56,
  tit: 56,
  // Philemon
  phlm: 57,
  philemon: 57,
  // Hebrews
  heb: 58,
  hebrews: 58,
  // James
  jas: 59,
  james: 59,
  // 1 Peter
  '1pet': 60,
  '1peter': 60,
  '1 pet': 60,
  '1 peter': 60,
  // 2 Peter
  '2pet': 61,
  '2peter': 61,
  '2 pet': 61,
  '2 peter': 61,
  // 1 John
  '1jn': 62,
  '1john': 62,
  '1 jn': 62,
  '1 john': 62,
  // 2 John
  '2jn': 63,
  '2john': 63,
  '2 jn': 63,
  '2 john': 63,
  // 3 John
  '3jn': 64,
  '3john': 64,
  '3 jn': 64,
  '3 john': 64,
  // Jude
  jude: 65,
  // Revelation
  rev: 66,
  revelation: 66,
  'the revelation': 66,
};

/**
 * All 66 books of the Bible with metadata
 */
export const BIBLE_BOOKS: readonly BibleBook[] = [
  { number: 1, name: 'Genesis', chapters: 50, testament: 'old' },
  { number: 2, name: 'Exodus', chapters: 40, testament: 'old' },
  { number: 3, name: 'Leviticus', chapters: 27, testament: 'old' },
  { number: 4, name: 'Numbers', chapters: 36, testament: 'old' },
  { number: 5, name: 'Deuteronomy', chapters: 34, testament: 'old' },
  { number: 6, name: 'Joshua', chapters: 24, testament: 'old' },
  { number: 7, name: 'Judges', chapters: 21, testament: 'old' },
  { number: 8, name: 'Ruth', chapters: 4, testament: 'old' },
  { number: 9, name: '1 Samuel', chapters: 31, testament: 'old' },
  { number: 10, name: '2 Samuel', chapters: 24, testament: 'old' },
  { number: 11, name: '1 Kings', chapters: 22, testament: 'old' },
  { number: 12, name: '2 Kings', chapters: 25, testament: 'old' },
  { number: 13, name: '1 Chronicles', chapters: 29, testament: 'old' },
  { number: 14, name: '2 Chronicles', chapters: 36, testament: 'old' },
  { number: 15, name: 'Ezra', chapters: 10, testament: 'old' },
  { number: 16, name: 'Nehemiah', chapters: 13, testament: 'old' },
  { number: 17, name: 'Esther', chapters: 10, testament: 'old' },
  { number: 18, name: 'Job', chapters: 42, testament: 'old' },
  { number: 19, name: 'Psalms', chapters: 150, testament: 'old' },
  { number: 20, name: 'Proverbs', chapters: 31, testament: 'old' },
  { number: 21, name: 'Ecclesiastes', chapters: 12, testament: 'old' },
  { number: 22, name: 'Song of Solomon', chapters: 8, testament: 'old' },
  { number: 23, name: 'Isaiah', chapters: 66, testament: 'old' },
  { number: 24, name: 'Jeremiah', chapters: 52, testament: 'old' },
  { number: 25, name: 'Lamentations', chapters: 5, testament: 'old' },
  { number: 26, name: 'Ezekiel', chapters: 48, testament: 'old' },
  { number: 27, name: 'Daniel', chapters: 12, testament: 'old' },
  { number: 28, name: 'Hosea', chapters: 14, testament: 'old' },
  { number: 29, name: 'Joel', chapters: 3, testament: 'old' },
  { number: 30, name: 'Amos', chapters: 9, testament: 'old' },
  { number: 31, name: 'Obadiah', chapters: 1, testament: 'old' },
  { number: 32, name: 'Jonah', chapters: 4, testament: 'old' },
  { number: 33, name: 'Micah', chapters: 7, testament: 'old' },
  { number: 34, name: 'Nahum', chapters: 3, testament: 'old' },
  { number: 35, name: 'Habakkuk', chapters: 3, testament: 'old' },
  { number: 36, name: 'Zephaniah', chapters: 3, testament: 'old' },
  { number: 37, name: 'Haggai', chapters: 2, testament: 'old' },
  { number: 38, name: 'Zechariah', chapters: 14, testament: 'old' },
  { number: 39, name: 'Malachi', chapters: 4, testament: 'old' },
  { number: 40, name: 'Matthew', chapters: 28, testament: 'new' },
  { number: 41, name: 'Mark', chapters: 16, testament: 'new' },
  { number: 42, name: 'Luke', chapters: 24, testament: 'new' },
  { number: 43, name: 'John', chapters: 21, testament: 'new' },
  { number: 44, name: 'Acts', chapters: 28, testament: 'new' },
  { number: 45, name: 'Romans', chapters: 16, testament: 'new' },
  { number: 46, name: '1 Corinthians', chapters: 16, testament: 'new' },
  { number: 47, name: '2 Corinthians', chapters: 13, testament: 'new' },
  { number: 48, name: 'Galatians', chapters: 6, testament: 'new' },
  { number: 49, name: 'Ephesians', chapters: 6, testament: 'new' },
  { number: 50, name: 'Philippians', chapters: 4, testament: 'new' },
  { number: 51, name: 'Colossians', chapters: 4, testament: 'new' },
  { number: 52, name: '1 Thessalonians', chapters: 5, testament: 'new' },
  { number: 53, name: '2 Thessalonians', chapters: 3, testament: 'new' },
  { number: 54, name: '1 Timothy', chapters: 6, testament: 'new' },
  { number: 55, name: '2 Timothy', chapters: 4, testament: 'new' },
  { number: 56, name: 'Titus', chapters: 3, testament: 'new' },
  { number: 57, name: 'Philemon', chapters: 1, testament: 'new' },
  { number: 58, name: 'Hebrews', chapters: 13, testament: 'new' },
  { number: 59, name: 'James', chapters: 5, testament: 'new' },
  { number: 60, name: '1 Peter', chapters: 5, testament: 'new' },
  { number: 61, name: '2 Peter', chapters: 3, testament: 'new' },
  { number: 62, name: '1 John', chapters: 5, testament: 'new' },
  { number: 63, name: '2 John', chapters: 1, testament: 'new' },
  { number: 64, name: '3 John', chapters: 1, testament: 'new' },
  { number: 65, name: 'Jude', chapters: 1, testament: 'new' },
  { number: 66, name: 'Revelation', chapters: 22, testament: 'new' },
];

const BOOK_BY_NUMBER = new Map(BIBLE_BOOKS.map((b) => [b.number, b]));

const BOOK_BY_NAME = new Map<string, BibleBook>([
  ...BIBLE_BOOKS.map((b) => [b.name.toLowerCase(), b] as const),
  ...Object.entries(BIBLE_BOOK_ALIASES).flatMap(([alias, num]) => {
    const book = BOOK_BY_NUMBER.get(num);
    return book ? ([[alias, book]] as const) : [];
  }),
]);

export function getBibleBook(bookNumber: number): BibleBook | undefined {
  return BOOK_BY_NUMBER.get(bookNumber);
}

export function getBibleBookByName(name: string): BibleBook | undefined {
  return BOOK_BY_NAME.get(name.trim().toLowerCase());
}

/**
 * Format a reference for display
 * Supports optional verse ranges (e.g., "John 3:16-18")
 */
export function formatBibleReference(ref: {
  book: number;
  chapter: number;
  verse?: number;
  verseEnd?: number;
}): string {
  const book = getBibleBook(ref.book);
  if (!book) return '';
  if (ref.verse !== undefined) {
    if (ref.verseEnd !== undefined && ref.verseEnd !== ref.verse) {
      return `${book.name} ${ref.chapter}:${ref.verse}-${ref.verseEnd}`;
    }
    return `${book.name} ${ref.chapter}:${ref.verse}`;
  }
  return `${book.name} ${ref.chapter}`;
}
