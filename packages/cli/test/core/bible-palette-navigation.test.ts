import { describe, expect, it } from 'bun:test';
import {
  initialBiblePaletteNavigation,
  transitionBiblePaletteNavigation,
} from '../../src/tui/components/bible/command-palette/navigation-model.js';

describe('Bible palette navigation model', () => {
  it('starts at the current Book and Chapter', () => {
    expect(initialBiblePaletteNavigation(43, 3)).toEqual({
      mode: 'chapters',
      query: '',
      selectedIndex: 0,
      selectedBook: 43,
      selectedChapter: 3,
    });
  });

  it('owns Book and Chapter drill-down invariants', () => {
    const initial = initialBiblePaletteNavigation(43, 3);
    const book = transitionBiblePaletteNavigation(
      { ...initial, mode: 'books', query: 'rom', selectedIndex: 4 },
      { _tag: 'chooseBook', book: 45 },
    );
    expect(book).toEqual({
      mode: 'chapters',
      query: '',
      selectedIndex: 0,
      selectedBook: 45,
      selectedChapter: 1,
    });

    expect(transitionBiblePaletteNavigation(book, { _tag: 'drillChapter', chapter: 8 })).toEqual({
      mode: 'verses',
      query: '',
      selectedIndex: 0,
      selectedBook: 45,
      selectedChapter: 8,
    });
  });

  it('restores the selected Chapter and Book when moving back', () => {
    const verses = {
      ...initialBiblePaletteNavigation(45, 8),
      mode: 'verses' as const,
      selectedChapter: 8,
    };
    const chapters = transitionBiblePaletteNavigation(verses, { _tag: 'back' });
    expect(chapters).toMatchObject({ mode: 'chapters', selectedIndex: 7, query: '' });

    const books = transitionBiblePaletteNavigation(chapters, { _tag: 'back' });
    expect(books).toMatchObject({ mode: 'books', selectedIndex: 44, query: '' });
    expect(transitionBiblePaletteNavigation(books, { _tag: 'back' })).toBe(books);
  });

  it('resets selection for a query and clamps movement to the current list', () => {
    const queried = transitionBiblePaletteNavigation(
      { ...initialBiblePaletteNavigation(43, 3), selectedIndex: 7 },
      { _tag: 'queryChanged', query: '16' },
    );
    expect(queried).toMatchObject({ query: '16', selectedIndex: 0 });

    const atEnd = transitionBiblePaletteNavigation(queried, {
      _tag: 'moveSelection',
      delta: 1,
      itemCount: 1,
    });
    expect(atEnd.selectedIndex).toBe(0);
    expect(
      transitionBiblePaletteNavigation(atEnd, {
        _tag: 'moveSelection',
        delta: -1,
        itemCount: 0,
      }).selectedIndex,
    ).toBe(0);
  });
});
