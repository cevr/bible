/**
 * EGW Book Palette
 *
 * A command palette for selecting EGW books.
 * Similar to the Bible command palette but lists EGW books.
 */

import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createMemo, createSignal, For, onMount, Show } from 'solid-js';

import { useEGWNavigation } from '../../context/egw-navigation.js';
import { useTheme } from '../../context/theme.js';

interface EGWBookPaletteProps {
  onClose: () => void;
}

export function EGWBookPalette(props: EGWBookPaletteProps) {
  const { theme } = useTheme();
  const { books, loadBooks, goToBook, loadingState } = useEGWNavigation();

  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // Load books on mount
  onMount(() => {
    if (books().length === 0) {
      loadBooks();
    }
  });

  // Filter books based on query
  const filteredBooks = createMemo(() => {
    const q = query().toLowerCase();
    if (!q) return books();
    return books().filter(
      (book) => book.title.toLowerCase().includes(q) || book.bookCode.toLowerCase().includes(q),
    );
  });

  // Reset selection when query changes
  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    setSelectedIndex(0);
  };

  // Handle key input
  useModalKeyboard((key) => {
    if (key.name === 'escape') {
      props.onClose();
      return;
    }

    if (key.name === 'return') {
      const selected = filteredBooks()[selectedIndex()];
      if (selected) {
        goToBook(selected.bookCode);
        props.onClose();
      }
      return;
    }

    if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      setSelectedIndex((i) => Math.min(filteredBooks().length - 1, i + 1));
      return;
    }

    if (key.name === 'backspace') {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
      return;
    }

    // Type characters into query
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      handleQueryChange(query() + key.sequence);
    }
  });

  const isLoading = () => loadingState()._tag === 'loading';
  const hasError = () => loadingState()._tag === 'error';

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().borderFocused}
      backgroundColor={theme().backgroundPanel}
      width={60}
      maxHeight={20}
    >
      {/* Search input */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg={theme().accent}>{'> '}</text>
        <text fg={theme().text}>{query()}</text>
        <text fg={theme().textMuted}>|</text>
      </box>

      {/* Book list */}
      <Show
        when={!isLoading()}
        fallback={
          <box padding={1}>
            <text fg={theme().textMuted}>Loading books...</text>
          </box>
        }
      >
        <Show
          when={!hasError()}
          fallback={
            <box padding={1}>
              <text fg={theme().error}>Error loading books</text>
            </box>
          }
        >
          <scrollbox
            focused={false}
            style={{
              flexGrow: 1,
              maxHeight: 15,
              rootOptions: { backgroundColor: theme().backgroundPanel },
              wrapperOptions: { backgroundColor: theme().backgroundPanel },
              viewportOptions: { backgroundColor: theme().backgroundPanel },
              contentOptions: { backgroundColor: theme().backgroundPanel },
            }}
          >
            <For each={filteredBooks().slice(0, 50)}>
              {(book, index) => (
                <box
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={index() === selectedIndex() ? theme().accent : undefined}
                >
                  <text fg={index() === selectedIndex() ? theme().background : theme().text}>
                    <span
                      style={{
                        fg: index() === selectedIndex() ? theme().background : theme().textMuted,
                      }}
                    >
                      [{book.bookCode}]
                    </span>{' '}
                    {book.title}
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
      </Show>

      {/* Footer */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().accent }}>Enter</span> select
          {'  '}
          <span style={{ fg: theme().accent }}>Esc</span> close
          {'  '}
          {filteredBooks().length} books
        </text>
      </box>
    </box>
  );
}
