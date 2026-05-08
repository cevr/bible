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
import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';

import { BOOKS, formatReference, type Book, type Reference } from '../../../data/bible/types.js';
import { searchBibleByTopic } from '../../../data/study/ai-search.js';
import { useBibleData, useBibleState } from '../../context/bible.js';
import { useModel } from '../../context/model.js';
import { useNavigation } from '../../context/navigation.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { AiSearchState } from '../../types/ai-search.js';

interface BibleCommandPaletteProps {
  onClose: () => void;
}

type PaletteMode = 'books' | 'chapters' | 'verses';

export function BibleCommandPalette(props: BibleCommandPaletteProps) {
  const { theme } = useTheme();
  const { position, goTo } = useNavigation();
  const data = useBibleData();
  const state = useBibleState();
  const model = useModel();

  // Current position
  const currentBookNum = () => position().book;
  const currentChapter = () => position().chapter;
  const currentVerse = () => position().verse;

  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [mode, setMode] = createSignal<PaletteMode>('chapters');
  const [selectedBookNum, setSelectedBookNum] = createSignal(currentBookNum());
  const [selectedChapter, setSelectedChapter] = createSignal(currentChapter());
  const [aiState, setAiState] = createSignal<AiSearchState>(AiSearchState.idle());

  let aiSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  // Scroll sync - keep selected item visible
  useScrollSync(() => `item-${selectedIndex()}`, { getRef: () => scrollRef });

  // Cleanup timeout on unmount
  onCleanup(() => {
    if (aiSearchTimeout) {
      clearTimeout(aiSearchTimeout);
    }
  });

  // Book info
  const selectedBook = createMemo(() => BOOKS.find((b) => b.number === selectedBookNum()));

  // Check if query is AI search
  const isAiSearch = () => query().trim().startsWith('?');
  const aiQuery = () => (isAiSearch() ? query().trim().slice(1).trim() : '');

  // AI search effect with debounce
  createEffect(() => {
    if (aiSearchTimeout) {
      clearTimeout(aiSearchTimeout);
      aiSearchTimeout = null;
    }

    if (!isAiSearch()) {
      setAiState(AiSearchState.idle());
      return;
    }

    const currentAiQuery = aiQuery();

    if (currentAiQuery.length < 3) {
      setAiState(AiSearchState.typing(currentAiQuery));
      return;
    }

    if (!model) {
      setAiState(
        AiSearchState.error(currentAiQuery, 'AI search unavailable (no API key configured)'),
      );
      return;
    }

    setAiState(AiSearchState.loading(currentAiQuery));

    aiSearchTimeout = setTimeout(async () => {
      try {
        const refs = await searchBibleByTopic(currentAiQuery, model, data, state);
        if (refs.length === 0) {
          setAiState(AiSearchState.empty(currentAiQuery));
        } else {
          setAiState(AiSearchState.success(currentAiQuery, refs));
        }
      } catch (err) {
        setAiState(
          AiSearchState.error(
            currentAiQuery,
            err instanceof Error ? err.message : 'AI search failed',
          ),
        );
      }
    }, 500);
  });

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
    const chapterVerses = data.getChapter(bookNum, chapter);
    return chapterVerses.map((v) => ({
      number: v.verse,
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
  const aiResults = createMemo((): Reference[] => {
    const currentState = aiState();
    if (currentState._tag === 'success') {
      return currentState.results;
    }
    return [];
  });

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

  // Reset selection when query or mode changes
  createEffect(() => {
    query();
    mode();
    setSelectedIndex(0);
  });

  // Handle selecting a book
  const handleSelectBook = (book: Book) => {
    setSelectedBookNum(book.number);
    setSelectedChapter(1);
    setMode('chapters');
    setQuery('');
    setSelectedIndex(0);
  };

  // Handle selecting a chapter
  const handleSelectChapter = (chapter: number) => {
    goTo({ book: selectedBookNum(), chapter });
    props.onClose();
  };

  // Handle drilling into a chapter to see verses
  const handleDrillIntoChapter = (chapter: number) => {
    setSelectedChapter(chapter);
    setMode('verses');
    setQuery('');
    setSelectedIndex(0);
  };

  // Handle selecting a verse
  const handleSelectVerse = (verseNum: number) => {
    goTo({
      book: selectedBookNum(),
      chapter: selectedChapter(),
      verse: verseNum,
    });
    props.onClose();
  };

  // Handle selecting an AI result
  const handleSelectAiResult = (ref: Reference) => {
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
        if (mode() === 'verses') {
          setMode('chapters');
          setQuery('');
          // Select the current chapter in the list
          const idx = chapters().findIndex((ch) => ch === selectedChapter());
          setSelectedIndex(idx >= 0 ? idx : 0);
        } else if (mode() === 'chapters') {
          setMode('books');
          setQuery('');
          // Select the current book in the list
          const idx = BOOKS.findIndex((b) => b.number === selectedBookNum());
          setSelectedIndex(idx >= 0 ? idx : 0);
        }
        return;
      }

      // Right to drill into next tier
      if (key.name === 'right') {
        if (mode() === 'books') {
          const book = filteredBooks()[selectedIndex()];
          if (book) {
            setSelectedBookNum(book.number);
            setSelectedChapter(1);
            setMode('chapters');
            setQuery('');
            setSelectedIndex(0);
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
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      const maxIndex = currentItems().length - 1;
      setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      return;
    }

    if (key.name === 'backspace') {
      setQuery((q) => q.slice(0, -1));
      return;
    }

    // Type characters into query
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setQuery((q) => q + key.sequence);
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
          <Show when={aiState()._tag === 'typing'}>
            <box padding={1}>
              <text fg={theme().textMuted}>Type at least 3 characters to search...</text>
            </box>
          </Show>
          <Show when={aiState()._tag === 'loading'}>
            <box padding={1}>
              <text fg={theme().textMuted}>Searching...</text>
            </box>
          </Show>
          <Show when={aiState()._tag === 'error'}>
            <box padding={1}>
              <text fg={theme().error}>
                {(aiState() as { _tag: 'error'; error: string }).error}
              </text>
            </box>
          </Show>
          <Show when={aiState()._tag === 'empty'}>
            <box padding={1}>
              <text fg={theme().textMuted}>No results found</text>
            </box>
          </Show>
          <Show when={aiState()._tag === 'success'}>
            <For each={aiResults()}>
              {(ref, index) => {
                const verse = data.getVerse(ref.book, ref.chapter, ref.verse ?? 1);
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
                        {formatReference(ref)}
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
