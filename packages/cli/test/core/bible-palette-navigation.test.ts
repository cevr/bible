import { describe, expect, it } from 'bun:test';
import {
  Back,
  BooksNavigation,
  ChooseBook,
  DrillChapter,
  MoveSelection,
  QueryChanged,
  VersesNavigation,
  biblePaletteNavigationMachine,
  initialBiblePaletteNavigation,
  transitionBiblePaletteNavigation,
} from '../../src/tui/components/bible/command-palette/navigation-model.js';

describe('Bible palette navigation machine', () => {
  it('starts at the current Book and Chapter', () => {
    expect(initialBiblePaletteNavigation(43, 3)).toEqual({
      _tag: 'chapters',
      query: '',
      selectedIndex: 0,
      selectedBook: 43,
      selectedChapter: 3,
    });
  });

  it('owns Book and Chapter drill-down invariants', () => {
    const initial = BooksNavigation({
      query: 'rom',
      selectedIndex: 4,
      selectedBook: 43,
      selectedChapter: 3,
    });
    const book = transitionBiblePaletteNavigation(initial, ChooseBook({ book: 45 }));
    expect(book).toEqual({
      _tag: 'chapters',
      query: '',
      selectedIndex: 0,
      selectedBook: 45,
      selectedChapter: 1,
    });

    expect(transitionBiblePaletteNavigation(book, DrillChapter({ chapter: 8 }))).toEqual({
      _tag: 'verses',
      query: '',
      selectedIndex: 0,
      selectedBook: 45,
      selectedChapter: 8,
    });
  });

  it('restores the selected Chapter and Book when moving back', () => {
    const verses = VersesNavigation({
      query: '',
      selectedIndex: 0,
      selectedBook: 45,
      selectedChapter: 8,
    });
    const chapters = transitionBiblePaletteNavigation(verses, Back());
    expect(chapters).toMatchObject({ _tag: 'chapters', selectedIndex: 7, query: '' });

    const books = transitionBiblePaletteNavigation(chapters, Back());
    expect(books).toMatchObject({ _tag: 'books', selectedIndex: 44, query: '' });
    expect(transitionBiblePaletteNavigation(books, Back())).toBe(books);
  });

  it('resets selection for a query and clamps movement to the current list', () => {
    const queried = transitionBiblePaletteNavigation(
      VersesNavigation({
        query: '',
        selectedIndex: 7,
        selectedBook: 43,
        selectedChapter: 3,
      }),
      QueryChanged({ query: '16' }),
    );
    expect(queried).toMatchObject({ query: '16', selectedIndex: 0 });

    const atEnd = transitionBiblePaletteNavigation(
      queried,
      MoveSelection({ delta: 1, itemCount: 1 }),
    );
    expect(atEnd.selectedIndex).toBe(0);
    expect(
      transitionBiblePaletteNavigation(atEnd, MoveSelection({ delta: -1, itemCount: 0 }))
        .selectedIndex,
    ).toBe(0);
  });

  it('exposes a complete, statically inspectable graph', () => {
    expect(biblePaletteNavigationMachine.unreachableStates()).toEqual([]);
    expect(biblePaletteNavigationMachine.deadTransitions()).toEqual([]);
    expect(biblePaletteNavigationMachine.toMermaid()).toContain('chapters --> verses');
  });
});
