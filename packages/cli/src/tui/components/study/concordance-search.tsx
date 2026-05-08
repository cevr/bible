/**
 * Concordance Search Overlay
 *
 * Search for verses by Strong's number or search Strong's entries by definition.
 * Enter a Strong's number (H1234 or G5678) to see all occurrences.
 */

import type { ScrollBoxRenderable } from '@opentui/core';
import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createMemo, createSignal, For, Show } from 'solid-js';

import type { Reference } from '../../../data/bible/types.js';
import { formatReference } from '../../../data/bible/types.js';
import { useBibleData } from '../../context/bible.js';
import { useStudyData } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';

interface ConcordanceSearchProps {
  onClose: () => void;
  onNavigate: (ref: Reference) => void;
  /** Optional initial Strong's number to search */
  initialQuery?: string;
}

export function ConcordanceSearch(props: ConcordanceSearchProps) {
  const { theme } = useTheme();
  const data = useBibleData();
  const studyData = useStudyData();

  const [query, setQuery] = createSignal(props.initialQuery ?? '');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  // Determine if query is a Strong's number
  const isStrongsQuery = createMemo(() => {
    const q = query().trim().toUpperCase();
    return /^[HG]\d+$/.test(q);
  });

  // Search results - either verses with Strong's number or Strong's entries by definition
  const results = createMemo(() => {
    const q = query().trim();
    if (q.length < 2) return [];

    if (isStrongsQuery()) {
      // Search for verses with this Strong's number
      return studyData.searchByStrongs(q);
    } else {
      // Search Strong's entries by definition
      return studyData.searchStrongsByDefinition(q);
    }
  });

  // Get occurrence count for Strong's searches
  const occurrenceCount = createMemo(() => {
    if (!isStrongsQuery()) return 0;
    return studyData.getStrongsOccurrenceCount(query().trim());
  });

  // Get Strong's entry info for header display
  const strongsInfo = createMemo(() => {
    if (!isStrongsQuery()) return null;
    return studyData.getStrongsEntry(query().trim().toUpperCase());
  });

  // Format results for display
  const formattedResults = createMemo(() => {
    const res = results();

    if (isStrongsQuery()) {
      // Concordance results - verses containing the Strong's number
      return (res as ReturnType<typeof studyData.searchByStrongs>)
        .map((r) => {
          const verse = data.getVerse(r.book, r.chapter, r.verse);
          let preview = '';
          if (verse) {
            preview = verse.text
              .replace(/\u00b6\s*/, '')
              .replace(/\[.*?\]/g, '')
              .slice(0, 40);
            if (verse.text.length > 40) preview += '...';
          }
          return {
            type: 'verse' as const,
            ref: { book: r.book, chapter: r.chapter, verse: r.verse },
            word: r.word,
            preview,
          };
        })
        .slice(0, 100); // Limit to 100 results for performance
    } else {
      // Strong's definition search results
      return (res as ReturnType<typeof studyData.searchStrongsByDefinition>).map((entry) => ({
        type: 'strongs' as const,
        number: entry.number,
        lemma: entry.lemma,
        def: entry.def.slice(0, 50) + (entry.def.length > 50 ? '...' : ''),
      }));
    }
  });

  const moveSelection = (delta: number) => {
    setSelectedIndex((i) => {
      const maxIndex = formattedResults().length - 1;
      const newIndex = i + delta;
      return Math.max(0, Math.min(maxIndex, newIndex));
    });
  };

  // Scroll to keep selected item visible
  useScrollSync(() => `result-${selectedIndex()}`, { getRef: () => scrollRef });

  const selectCurrent = () => {
    const res = formattedResults();
    const selected = res[selectedIndex()];
    if (!selected) return;

    if (selected.type === 'verse') {
      props.onNavigate(selected.ref);
    } else if (selected.type === 'strongs') {
      // Switch to searching this Strong's number
      setQuery(selected.number);
      setSelectedIndex(0);
    }
  };

  const handleInput = (char: string) => {
    setQuery((q) => q + char);
    setSelectedIndex(0);
  };

  const handleBackspace = () => {
    setQuery((q) => q.slice(0, -1));
    setSelectedIndex(0);
  };

  useModalKeyboard((key) => {
    if (key.name === 'escape') {
      props.onClose();
      return;
    }

    if (key.name === 'return') {
      selectCurrent();
      return;
    }

    if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
      moveSelection(-1);
      return;
    }

    if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
      moveSelection(1);
      return;
    }

    if (key.name === 'backspace') {
      handleBackspace();
      return;
    }

    // Handle character input
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      handleInput(key.sequence);
      return;
    }
  });

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().borderFocused}
      backgroundColor={theme().backgroundPanel}
      width={70}
      maxHeight={22}
      padding={1}
    >
      {/* Header */}
      <box marginBottom={1}>
        <text fg={theme().text}>
          <strong>Strong's Concordance Search</strong>
        </text>
      </box>

      {/* Search Input */}
      <box border borderColor={theme().border} paddingLeft={1} paddingRight={1} marginBottom={1}>
        <text fg={theme().text}>
          {query() || (
            <span style={{ fg: theme().textMuted }}>Type H1234, G5678, or English word...</span>
          )}
          <span style={{ fg: theme().accent }}>_</span>
        </text>
      </box>

      {/* Strong's info header (when searching by number) */}
      <Show when={isStrongsQuery() && strongsInfo()}>
        <box marginBottom={1}>
          <text fg={theme().textMuted}>
            <span style={{ fg: theme().accent }}>{strongsInfo()?.number}</span>{' '}
            <span style={{ fg: theme().text }}>{strongsInfo()?.lemma}</span>
            {' - '}
            {strongsInfo()?.def.slice(0, 40)}... ({occurrenceCount()} occurrences)
          </text>
        </box>
      </Show>

      {/* Results */}
      <Show
        when={formattedResults().length > 0}
        fallback={
          <Show when={query().length >= 2}>
            <text fg={theme().textMuted}>No results found</text>
          </Show>
        }
      >
        <scrollbox
          ref={(el) => (scrollRef = el)}
          focused={false}
          style={{
            height: 10,
            rootOptions: {
              backgroundColor: theme().backgroundPanel,
            },
            wrapperOptions: {
              backgroundColor: theme().backgroundPanel,
            },
            viewportOptions: {
              backgroundColor: theme().backgroundPanel,
            },
            contentOptions: {
              backgroundColor: theme().backgroundPanel,
            },
            scrollbarOptions: {
              showArrows: false,
              trackOptions: {
                foregroundColor: theme().accent,
                backgroundColor: theme().border,
              },
            },
          }}
        >
          <For each={formattedResults()}>
            {(item, index) => {
              const isSelected = () => index() === selectedIndex();

              if (item.type === 'verse') {
                const refText = formatReference(item.ref).padEnd(20);
                return (
                  <text
                    id={`result-${index()}`}
                    fg={isSelected() ? theme().accent : theme().textMuted}
                  >
                    {isSelected() ? '▶ ' : '  '}
                    <span
                      style={{
                        fg: isSelected() ? theme().accent : theme().text,
                      }}
                    >
                      {isSelected() ? <strong>{refText}</strong> : refText}
                    </span>
                    <span style={{ fg: theme().textMuted }}>{item.word.padEnd(12)}</span>
                    {item.preview}
                  </text>
                );
              } else {
                // Strong's entry result
                return (
                  <text
                    id={`result-${index()}`}
                    fg={isSelected() ? theme().accent : theme().textMuted}
                  >
                    {isSelected() ? '▶ ' : '  '}
                    <span
                      style={{
                        fg: isSelected() ? theme().accent : theme().text,
                      }}
                    >
                      {isSelected() ? (
                        <strong>{item.number.padEnd(8)}</strong>
                      ) : (
                        item.number.padEnd(8)
                      )}
                    </span>
                    <span style={{ fg: theme().text }}>{item.lemma.padEnd(15)}</span>
                    {item.def}
                  </text>
                );
              }
            }}
          </For>
        </scrollbox>
      </Show>

      {/* Footer */}
      <box marginTop={1}>
        <text fg={theme().textMuted}>↑↓ navigate • Enter select • Esc close</text>
      </box>
    </box>
  );
}
