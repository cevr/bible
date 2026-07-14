/**
 * Bible Command Palette
 *
 * A tiered command palette for Bible navigation.
 * - Books → Chapters → Verses
 * - Press left/right to navigate between tiers
 * - Press Enter to select, Esc to close
 * - Search to filter results
 * - Type ? to search by AI topic
 */

import type { ScrollBoxRenderable } from '@opentui/core';
import {
  BIBLE_BOOKS as BOOKS,
  formatBibleReference,
  Reference,
  type Book,
} from '@bible/core/bible';
import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { Effect } from 'effect';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';

import type { ReaderReference } from '../../../app/reader-reference.js';
import { searchBibleByTopic } from '../../../data/study/ai-search.js';
import { AI } from '../../../services/ai.js';
import { useBibleReader } from '../../context/bible.js';
import { useModel } from '../../context/model.js';
import { useNavigation } from '../../context/navigation.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { useAppRuntime } from '../../lib/index.js';
import {
  Back,
  ChooseBook,
  DrillChapter,
  MoveSelection,
  QueryChanged,
  initialBiblePaletteNavigation,
  transitionBiblePaletteNavigation,
} from './command-palette/navigation-model.js';
import { createBibleTopicSearchController } from './command-palette/topic-search-controller.js';

interface BibleCommandPaletteProps {
  onClose: () => void;
}

export function BibleCommandPalette(props: BibleCommandPaletteProps) {
  const { theme } = useTheme();
  const { position, goTo } = useNavigation();
  const reader = useBibleReader();
  const model = useModel();
  const runtime = useAppRuntime();

  // Current position
  const currentBookNum = () => position().book;
  const currentChapter = () => position().chapter;
  const currentVerse = () => position().verse;

  const [navigation, setNavigation] = createSignal(
    initialBiblePaletteNavigation(currentBookNum(), currentChapter()),
  );
  const query = () => navigation().query;
  const selectedIndex = () => navigation().selectedIndex;
  const mode = () => navigation()._tag;
  const selectedBookNum = () => navigation().selectedBook;
  const selectedChapter = () => navigation().selectedChapter;
  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  const topicSearch = createBibleTopicSearchController({
    search:
      model === null
        ? null
        : (topic) =>
            runtime.runPromise(
              searchBibleByTopic(topic).pipe(Effect.provide(AI.fromModel(model.models))),
            ),
  });

  // Scroll sync - keep selected item visible
  useScrollSync(() => `item-${selectedIndex()}`, { getRef: () => scrollRef });

  onCleanup(topicSearch.dispose);

  // Book info
  const selectedBook = createMemo(() => BOOKS.find((b) => b.number === selectedBookNum()));

  createEffect(() => topicSearch.update(query()));

  const isAiSearch = topicSearch.active;

  // Filter books based on query
  const filteredBooks = createMemo(() => {
    const q = query().toLowerCase();
    if (!q) return BOOKS;
    return BOOKS.filter((book) => book.name.toLowerCase().includes(q));
  });

  // Generate chapter list for selected book
  const chapters = createMemo(() => {
    const book = selectedBook();
    if (!book) return [];
    return Array.from({ length: book.chapters }, (_, i) => i + 1);
  });

  // Filter chapters based on query
  const filteredChapters = createMemo(() => {
    const q = query().trim();
    if (!q) return chapters();
    const num = parseInt(q, 10);
    if (!isNaN(num)) {
      return chapters().filter((ch) => ch.toString().startsWith(q));
    }
    return chapters();
  });

  // Get verses for selected chapter
  const verses = createMemo(() => {
    const bookNum = selectedBookNum();
    const chapter = selectedChapter();
    const chapterVerses = reader.chapter(Reference.chapter(bookNum, chapter));
    return chapterVerses.map((v) => ({
      number: v.reference.verse,
      text: v.text,
    }));
  });

  // Filter verses based on query
  const filteredVerses = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return verses();
    const num = parseInt(q, 10);
    if (!isNaN(num)) {
      return verses().filter((v) => v.number.toString().startsWith(q));
    }
    // Also search by text content
    return verses().filter(
      (v) => v.number.toString().includes(q) || v.text.toLowerCase().includes(q),
    );
  });

  // AI search results
  const aiResults = topicSearch.results;

  const currentItems = createMemo(() => {
    if (isAiSearch()) {
      return aiResults();
    }
    switch (mode()) {
      case 'books':
        return filteredBooks();
      case 'chapters':
        return filteredChapters();
      case 'verses':
        return filteredVerses();
    }
  });

  // Handle selecting a book
  const handleSelectBook = (book: Book) => {
    setNavigation((state) =>
      transitionBiblePaletteNavigation(state, ChooseBook({ book: book.number })),
    );
  };

  // Handle selecting a chapter
  const handleSelectChapter = (chapter: number) => {
    goTo(Reference.chapter(selectedBookNum(), chapter));
    props.onClose();
  };

  // Handle drilling into a chapter to see verses
  const handleDrillIntoChapter = (chapter: number) => {
    setNavigation((state) => transitionBiblePaletteNavigation(state, DrillChapter({ chapter })));
  };

  // Handle selecting a verse
  const handleSelectVerse = (verseNum: number) => {
    goTo(Reference.verse(selectedBookNum(), selectedChapter(), verseNum));
    props.onClose();
  };

  // Handle selecting an AI result
  const handleSelectAiResult = (ref: ReaderReference) => {
    goTo(ref);
    props.onClose();
  };

  useModalKeyboard((key) => {
    if (key.name === 'escape') {
      props.onClose();
      return;
    }

    if (key.name === 'return') {
      if (isAiSearch()) {
        const results = aiResults();
        const ref = results[selectedIndex()];
        if (ref) {
          handleSelectAiResult(ref);
        }
      } else if (mode() === 'books') {
        const book = filteredBooks()[selectedIndex()];
        if (book) {
          handleSelectBook(book);
        }
      } else if (mode() === 'chapters') {
        const chapter = filteredChapters()[selectedIndex()];
        if (chapter) {
          handleSelectChapter(chapter);
        }
      } else if (mode() === 'verses') {
        const verse = filteredVerses()[selectedIndex()];
        if (verse) {
          handleSelectVerse(verse.number);
        }
      }
      return;
    }

    // Don't handle left/right in AI search mode
    if (!isAiSearch()) {
      // Left to go back a tier
      if (key.name === 'left') {
        setNavigation((state) => transitionBiblePaletteNavigation(state, Back()));
        return;
      }

      // Right to drill into next tier
      if (key.name === 'right') {
        if (mode() === 'books') {
          const book = filteredBooks()[selectedIndex()];
          if (book) {
            setNavigation((state) =>
              transitionBiblePaletteNavigation(state, ChooseBook({ book: book.number })),
            );
          }
        } else if (mode() === 'chapters') {
          const chapter = filteredChapters()[selectedIndex()];
          if (chapter) {
            handleDrillIntoChapter(chapter);
          }
        }
        return;
      }
    }

    if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
      setNavigation((state) =>
        transitionBiblePaletteNavigation(
          state,
          MoveSelection({
            delta: -1,
            itemCount: currentItems().length,
          }),
        ),
      );
      return;
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      setNavigation((state) =>
        transitionBiblePaletteNavigation(
          state,
          MoveSelection({
            delta: 1,
            itemCount: currentItems().length,
          }),
        ),
      );
      return;
    }

    if (key.name === 'backspace') {
      setNavigation((state) =>
        transitionBiblePaletteNavigation(state, QueryChanged({ query: state.query.slice(0, -1) })),
      );
      return;
    }

    // Type characters into query
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setNavigation((state) =>
        transitionBiblePaletteNavigation(
          state,
          QueryChanged({ query: state.query + key.sequence }),
        ),
      );
    }
  });

  // Mode indicator text
  const getModeIndicator = () => {
    const book = selectedBook();
    switch (mode()) {
      case 'books':
        return null;
      case 'chapters':
        return book ? ` (${book.name})` : '';
      case 'verses':
        return book ? ` (${book.name} ${selectedChapter()})` : '';
    }
  };

  // Shared scrollbox style
  const scrollboxStyle = () => ({
    flexGrow: 1,
    maxHeight: 15,
    rootOptions: { backgroundColor: theme().backgroundPanel },
    wrapperOptions: { backgroundColor: theme().backgroundPanel },
    viewportOptions: { backgroundColor: theme().backgroundPanel },
    contentOptions: { backgroundColor: theme().backgroundPanel },
  });

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().borderFocused}
      backgroundColor={theme().backgroundPanel}
      width={65}
      maxHeight={22}
    >
      {/* Mode indicator */}
      <Show when={!isAiSearch()}>
        <box flexDirection="row" paddingLeft={1} paddingRight={1} marginBottom={0}>
          <text fg={mode() === 'books' ? theme().textHighlight : theme().textMuted}>
            <Show when={mode() === 'books'} fallback="Books">
              <strong>Books</strong>
            </Show>
          </text>
          <text fg={theme().textMuted}> / </text>
          <text fg={mode() === 'chapters' ? theme().textHighlight : theme().textMuted}>
            <Show when={mode() === 'chapters'} fallback="Chapters">
              <strong>Chapters</strong>
            </Show>
          </text>
          <text fg={theme().textMuted}> / </text>
          <text fg={mode() === 'verses' ? theme().textHighlight : theme().textMuted}>
            <Show when={mode() === 'verses'} fallback="Verses">
              <strong>Verses</strong>
            </Show>
          </text>
          <text fg={theme().textMuted}>{getModeIndicator()}</text>
        </box>
      </Show>

      <Show when={isAiSearch()}>
        <box paddingLeft={1} paddingRight={1} marginBottom={0}>
          <text fg={theme().textHighlight}>
            <strong>AI Search</strong>
          </text>
        </box>
      </Show>

      {/* Search input */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg={theme().accent}>{'> '}</text>
        <text fg={theme().text}>{query()}</text>
        <text fg={theme().textMuted}>|</text>
      </box>

      {/* AI Search Results */}
      <Show when={isAiSearch()}>
        <scrollbox ref={(el) => (scrollRef = el)} focused={false} style={scrollboxStyle()}>
          <Show when={topicSearch.typing()}>
            <box padding={1}>
              <text fg={theme().textMuted}>Type at least 3 characters to search...</text>
            </box>
          </Show>
          <Show when={topicSearch.loading()}>
            <box padding={1}>
              <text fg={theme().textMuted}>Searching...</text>
            </box>
          </Show>
          <Show when={topicSearch.error()}>
            <box padding={1}>
              <text fg={theme().error}>{topicSearch.error()}</text>
            </box>
          </Show>
          <Show when={topicSearch.empty()}>
            <box padding={1}>
              <text fg={theme().textMuted}>No results found</text>
            </box>
          </Show>
          <Show when={aiResults().length > 0}>
            <For each={aiResults()}>
              {(ref, index) => {
                const verse = reader.verse(
                  ref._tag === 'verse' ? ref : Reference.verse(ref.book, ref.chapter, 1),
                );
                const preview = verse
                  ? verse.text.slice(0, 40) + (verse.text.length > 40 ? '...' : '')
                  : '';
                return (
                  <box
                    id={`item-${index()}`}
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={index() === selectedIndex() ? theme().accent : undefined}
                  >
                    <text fg={index() === selectedIndex() ? theme().background : theme().text}>
                      <span
                        style={{
                          fg:
                            index() === selectedIndex()
                              ? theme().background
                              : theme().textHighlight,
                        }}
                      >
                        {formatBibleReference(ref)}
                      </span>{' '}
                      <span
                        style={{
                          fg: index() === selectedIndex() ? theme().background : theme().textMuted,
                        }}
                      >
                        {preview}
                      </span>
                    </text>
                  </box>
                );
              }}
            </For>
          </Show>
        </scrollbox>
      </Show>

      {/* Books list */}
      <Show when={!isAiSearch() && mode() === 'books'}>
        <scrollbox ref={(el) => (scrollRef = el)} focused={false} style={scrollboxStyle()}>
          <For each={filteredBooks()}>
            {(book, index) => (
              <box
                id={`item-${index()}`}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={index() === selectedIndex() ? theme().accent : undefined}
              >
                <text fg={index() === selectedIndex() ? theme().background : theme().text}>
                  {book.name}
                  <span
                    style={{
                      fg: index() === selectedIndex() ? theme().background : theme().textMuted,
                    }}
                  >
                    {' '}
                    ({book.chapters} ch)
                  </span>
                  <Show when={book.number === currentBookNum()}>
                    <span
                      style={{
                        fg: index() === selectedIndex() ? theme().background : theme().accent,
                      }}
                    >
                      {' '}
                      ●
                    </span>
                  </Show>
                </text>
              </box>
            )}
          </For>
          <Show when={filteredBooks().length === 0}>
            <box padding={1}>
              <text fg={theme().textMuted}>No books found</text>
            </box>
          </Show>
        </scrollbox>
      </Show>

      {/* Chapters list */}
      <Show when={!isAiSearch() && mode() === 'chapters'}>
        <scrollbox ref={(el) => (scrollRef = el)} focused={false} style={scrollboxStyle()}>
          <For each={filteredChapters()}>
            {(chapter, index) => {
              const isSelected = () => index() === selectedIndex();
              const isCurrent =
                selectedBookNum() === currentBookNum() && chapter === currentChapter();

              return (
                <box
                  id={`item-${index()}`}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? theme().accent : undefined}
                >
                  <text fg={isSelected() ? theme().background : theme().text}>
                    <span
                      style={{
                        fg: isSelected()
                          ? theme().background
                          : isCurrent
                            ? theme().accent
                            : theme().textHighlight,
                      }}
                    >
                      Chapter {chapter}
                    </span>
                    <Show when={isCurrent}>
                      <span
                        style={{
                          fg: isSelected() ? theme().background : theme().accent,
                        }}
                      >
                        {' '}
                        ●
                      </span>
                    </Show>
                  </text>
                </box>
              );
            }}
          </For>
          <Show when={filteredChapters().length === 0}>
            <box padding={1}>
              <text fg={theme().textMuted}>No chapters found</text>
            </box>
          </Show>
        </scrollbox>
      </Show>

      {/* Verses list */}
      <Show when={!isAiSearch() && mode() === 'verses'}>
        <scrollbox ref={(el) => (scrollRef = el)} focused={false} style={scrollboxStyle()}>
          <For each={filteredVerses()}>
            {(verse, index) => {
              const isSelected = () => index() === selectedIndex();
              const isCurrent =
                selectedBookNum() === currentBookNum() &&
                selectedChapter() === currentChapter() &&
                verse.number === currentVerse();
              const preview = verse.text.slice(0, 50) + (verse.text.length > 50 ? '...' : '');

              return (
                <box
                  id={`item-${index()}`}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? theme().accent : undefined}
                >
                  <text fg={isSelected() ? theme().background : theme().text}>
                    <span
                      style={{
                        fg: isSelected()
                          ? theme().background
                          : isCurrent
                            ? theme().accent
                            : theme().textHighlight,
                      }}
                    >
                      {verse.number.toString().padStart(3, ' ')}
                    </span>{' '}
                    <span
                      style={{
                        fg: isSelected() ? theme().background : theme().textMuted,
                      }}
                    >
                      {preview}
                    </span>
                  </text>
                </box>
              );
            }}
          </For>
          <Show when={filteredVerses().length === 0}>
            <box padding={1}>
              <text fg={theme().textMuted}>No verses found</text>
            </box>
          </Show>
        </scrollbox>
      </Show>

      {/* Footer */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().accent }}>Enter</span> select{'  '}
          <Show when={!isAiSearch()}>
            <span style={{ fg: theme().accent }}>←/→</span> navigate{'  '}
          </Show>
          <Show when={model && !isAiSearch()}>
            <span style={{ fg: theme().accent }}>?</span> AI{'  '}
          </Show>
          <span style={{ fg: theme().accent }}>Esc</span> close
        </text>
      </box>
    </box>
  );
}
