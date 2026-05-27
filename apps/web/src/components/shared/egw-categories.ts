/**
 * EGW book categories — shared between the EGW route book list and the command palette.
 */
import type { EGWBookInfo } from '@/data/egw/api';

export const EGW_CATEGORIES: { label: string; codes: Set<string> }[] = [
  {
    label: 'Conflict of the Ages',
    codes: new Set(['PP', 'PK', 'DA', 'AA', 'GC']),
  },
  {
    label: 'Bible Commentary',
    codes: new Set(['1BC', '2BC', '3BC', '4BC', '5BC', '6BC', '7BC', '7aBC']),
  },
  {
    label: 'Testimonies for the Church',
    codes: new Set(['1T', '2T', '3T', '4T', '5T', '6T', '7T', '8T', '9T']),
  },
  {
    label: 'Selected Messages',
    codes: new Set(['1SM', '2SM', '3SM']),
  },
  {
    label: 'Christian Living',
    codes: new Set(['SC', 'COL', 'MH', 'Ed', 'MB', 'MYP', 'AH', 'CG', 'CT', 'FE']),
  },
  {
    label: 'Devotional',
    codes: new Set([
      'ML',
      'OHC',
      'HP',
      'RC',
      'AG',
      'FLB',
      'SD',
      'TMK',
      'LHU',
      'TDG',
      'UL',
      'HP',
      'Mar',
      'CC',
    ]),
  },
  {
    label: 'Church & Ministry',
    codes: new Set(['TM', 'GW', 'Ev', 'ChS', 'CM', 'WM', 'LS', 'CS']),
  },
  {
    label: 'Health & Temperance',
    codes: new Set(['CH', 'CD', 'Te', '2MCP', 'MM']),
  },
  {
    label: 'History & Prophecy',
    codes: new Set(['EW', 'SR', 'SG', 'SP', '1SP', '2SP', '3SP', '4SP', 'TA']),
  },
];

/** Reverse lookup: bookCode → category label */
export const CODE_TO_CATEGORY = new Map<string, string>();
for (const cat of EGW_CATEGORIES) {
  for (const code of cat.codes) {
    CODE_TO_CATEGORY.set(code, cat.label);
  }
}

export type CategorizedBooks = { label: string; books: readonly EGWBookInfo[] }[];

export function categorizeBooks(books: readonly EGWBookInfo[]): CategorizedBooks {
  const grouped = new Map<string, EGWBookInfo[]>();
  const uncategorized: EGWBookInfo[] = [];

  for (const book of books) {
    const cat = CODE_TO_CATEGORY.get(book.bookCode);
    if (cat) {
      const list = grouped.get(cat);
      if (list) list.push(book);
      else grouped.set(cat, [book]);
    } else {
      uncategorized.push(book);
    }
  }

  // Preserve category order from EGW_CATEGORIES
  const result: CategorizedBooks = [];
  for (const cat of EGW_CATEGORIES) {
    const list = grouped.get(cat.label);
    if (list && list.length > 0) {
      result.push({ label: cat.label, books: list });
    }
  }
  if (uncategorized.length > 0) {
    result.push({ label: 'Other', books: uncategorized });
  }
  return result;
}
