import { describe, expect, test } from 'bun:test';

import { authorMatches, PIONEER_AUTHOR_FILTERS } from '../../src/commands/egw/pioneer-authors.js';

describe('historic pioneer author preset', () => {
  test('includes the broad pioneer corpus used by the Bible skill', () => {
    expect(authorMatches('Joseph Bates', PIONEER_AUTHOR_FILTERS)).toBe(true);
    expect(authorMatches('John Norton Loughborough', PIONEER_AUTHOR_FILTERS)).toBe(true);
    expect(authorMatches('Alonzo Trevier Jones', PIONEER_AUTHOR_FILTERS)).toBe(true);
    expect(authorMatches('Ellet Joseph Waggoner', PIONEER_AUTHOR_FILTERS)).toBe(true);
    expect(authorMatches('George Storrs', PIONEER_AUTHOR_FILTERS)).toBe(true);
  });

  test('matches pioneer periodical catalog names', () => {
    expect(authorMatches('Signs of the Times [J.V. Himes]', PIONEER_AUTHOR_FILTERS)).toBe(true);
    expect(authorMatches('Advent Review', PIONEER_AUTHOR_FILTERS)).toBe(true);
  });

  test('does not include modern secondary works', () => {
    expect(authorMatches('LeRoy Edwin Froom', PIONEER_AUTHOR_FILTERS)).toBe(false);
    expect(authorMatches('Francis D. Nichol', PIONEER_AUTHOR_FILTERS)).toBe(false);
  });
});
