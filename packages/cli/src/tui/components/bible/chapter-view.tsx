import type { ScrollBoxRenderable } from '@opentui/core';
import { Reference } from '@bible/core/bible';
import { createMemo, For, Show } from 'solid-js';

import { useBibleReader } from '../../context/bible.js';
import { useDisplay } from '../../context/display.js';
import { useNavigation } from '../../context/navigation.js';
import { useSearch } from '../../context/search.js';
import { useStudyData } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';
import { useWordMode } from '../../context/word-mode.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { Verse, VerseParagraph } from './verse.js';

export function ChapterView() {
  const { theme } = useTheme();
  const { position, selectedVerse, highlightedVerse } = useNavigation();
  const { mode } = useDisplay();
  const { query, matches, isActive } = useSearch();
  const wordMode = useWordMode();
  const reader = useBibleReader();
  const studyData = useStudyData();

  // Get search match verse numbers for highlighting
  const searchMatchVerses = createMemo(() => {
    if (!isActive() || !query()) return [];
    return matches().map((m) => m.verse);
  });

  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  // Get verses for current chapter
  const verses = () => reader.chapter(Reference.chapter(position().book, position().chapter));

  // Sync scroll to selected verse
  useScrollSync(() => `verse-${selectedVerse()}`, { getRef: () => scrollRef });

  return (
    <Show
      when={verses().length > 0}
      fallback={
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <text fg={theme().textMuted}>No verses found</text>
        </box>
      }
    >
      <scrollbox
        ref={(el) => (scrollRef = el)}
        focused={false}
        style={{
          flexGrow: 1,
          rootOptions: {
            backgroundColor: theme().background,
          },
          wrapperOptions: {
            backgroundColor: theme().background,
          },
          viewportOptions: {
            backgroundColor: theme().background,
          },
          contentOptions: {
            backgroundColor: theme().background,
            paddingTop: 1,
            paddingBottom: 1,
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
        <Show
          when={mode() === 'verse'}
          fallback={
            <VerseParagraph
              verses={verses()}
              highlightedVerse={selectedVerse()}
              searchQuery={isActive() ? query() : undefined}
              searchMatchVerses={searchMatchVerses()}
            />
          }
        >
          <For each={verses()}>
            {(verse) => {
              const isWordModeVerse = () => {
                const s = wordMode.state();
                return s._tag === 'active' && s.verseRef.verse === verse.reference.verse;
              };
              const words = () => {
                const s = wordMode.state();
                return s._tag === 'active' && s.verseRef.verse === verse.reference.verse
                  ? s.words
                  : undefined;
              };
              const selectedWordIndex = () => {
                const s = wordMode.state();
                return s._tag === 'active' && s.verseRef.verse === verse.reference.verse
                  ? s.wordIndex
                  : undefined;
              };
              const marginNotes = () => studyData.marginNotes.forVerse(verse.reference);

              return (
                <Verse
                  id={`verse-${verse.reference.verse}`}
                  verse={verse}
                  isHighlighted={
                    selectedVerse() === verse.reference.verse ||
                    highlightedVerse() === verse.reference.verse
                  }
                  isSearchMatch={searchMatchVerses().includes(verse.reference.verse)}
                  searchQuery={isActive() ? query() : undefined}
                  wordModeActive={isWordModeVerse()}
                  words={words()}
                  selectedWordIndex={selectedWordIndex()}
                  marginNotes={marginNotes()}
                />
              );
            }}
          </For>
        </Show>
      </scrollbox>
    </Show>
  );
}
