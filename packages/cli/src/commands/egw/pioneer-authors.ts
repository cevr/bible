/**
 * Author and periodical names used by the historic-pioneer corpus preset.
 *
 * The EGW catalog uses full names and sometimes stores a periodical name in
 * the author field. Keep the values as case-insensitive substrings so one
 * filter can cover catalog variants.
 */
export const PIONEER_AUTHOR_FILTERS = [
  'William Miller',
  'Joshua V. Himes',
  'J.V. Himes',
  'Josiah Litch',
  'Sylvester Bliss',
  'Apollos Hale',
  'Charles Fitch',
  'George Storrs',
  'James Springer White',
  'Joseph Bates',
  'John Nevins Andrews',
  'John Norton Loughborough',
  'Uriah Smith',
  'Stephen Nelson Haskell',
  'Ellet Joseph Waggoner',
  'Joseph Harvey Waggoner',
  'Alonzo Trevier Jones',
  'Daniel T. Bourdeau',
  'Hiram Edson',
  'Owen Russel Loomies Crosier',
  'Advent Review',
] as const;

export const authorMatches = (author: string, filters: readonly string[]): boolean =>
  filters.length === 0 ||
  filters.some((filter) => author.toLowerCase().includes(filter.toLowerCase()));
