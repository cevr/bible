/**
 * Search over the real compiled hymnal (`src/test/setup.ts` hands in the
 * words the bundler derives), by number, title word and first-line word.
 */

import { describe, expect, it } from 'bun:test';

import { hymns } from './hymns';
import { fold, indexOf, search } from './search';

const index = indexOf(hymns);
const numbers = (query: string) => search(index, query).map((h) => h.number);

describe('search', () => {
  it('finds a hymn by its number first, then the numbers that start with it', () => {
    const found = numbers('100');
    expect(found[0]).toBe(100);
    expect(found.slice(1)).toEqual([]);
    expect(numbers('69').slice(0, 3)).toEqual([69, 690, 691]);
  });

  it('finds a hymn by a word of its title, the title matches first', () => {
    const found = search(index, 'shepherd');
    expect(found.map((h) => h.number)).toContain(545);
    const titled = found.filter((h) => /shepherd/i.test(h.title));
    expect(titled.length).toBeGreaterThan(10);
    expect(found.slice(0, titled.length)).toEqual(titled);
  });

  it('finds a hymn by a word of its first line alone, after the title matches', () => {
    // "purple" is in no title; hymn 498 opens "Still, still with Thee, when purple morning breaketh".
    expect(numbers('purple')).toContain(498);
    const morning = numbers('morning');
    const titled = search(index, 'morning').filter((h) => /morning/i.test(h.title));
    expect(morning.slice(0, titled.length)).toEqual(titled.map((h) => h.number));
    expect(morning).toContain(498);
  });

  it('reads a word still being typed as a prefix, and needs every word', () => {
    // "great" alone finds nine hymns; with the other words, only 100 holds them all.
    expect(numbers('great').length).toBeGreaterThan(1);
    expect(numbers('great is thy faith')).toEqual([100]);
  });

  it('ignores case, accents and punctuation', () => {
    expect(fold('O’er the Hills, Café!')).toBe('oer the hills cafe');
    // Hymn 172 holds "o'er"; a curly apostrophe and capitals find it too.
    expect(numbers("o'er")).toContain(172);
    expect(numbers("o'er")).toEqual(numbers('O’ER'));
  });

  it('lists every hymn for an empty query', () => {
    expect(numbers('  ')).toHaveLength(695);
  });
});
