import type { ScrollBoxRenderable } from '@opentui/core';
import { createMemo, For, Show } from 'solid-js';

import { useBibleData } from '../../context/bible.js';
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
  const data = useBibleData();
  const studyData = useStudyData();

  // Get search match verse numbers for highlighting
  const searchMatchVerses = createMemo(() => {
    if (!isActive() || !query()) return [];
    return matches().map((m) => m.verse);
  });

  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  // Get verses for current chapter
  const verses = () => data.getChapter(position().book, position().chapter);

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
                return s._tag === 'active' && s.verseRef.verse === verse.verse;
              };
              const words = () => {
                const s = wordMode.state();
                return s._tag === 'active' && s.verseRef.verse === verse.verse
                  ? s.words
                  : undefined;
              };
              const selectedWordIndex = () => {
                const s = wordMode.state();
                return s._tag === 'active' && s.verseRef.verse === verse.verse
                  ? s.wordIndex
                  : undefined;
              };
              const marginNotes = () =>
                studyData.getMarginNotes(position().book, position().chapter, verse.verse);

              return (
                <Verse
                  id={`verse-${verse.verse}`}
                  verse={verse}
                  isHighlighted={
                    selectedVerse() === verse.verse || highlightedVerse() === verse.verse
                  }
                  isSearchMatch={searchMatchVerses().includes(verse.verse)}
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
