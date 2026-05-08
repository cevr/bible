/**
 * EGW Chapter View
 *
 * Renders the current EGW book's paragraphs in a scrollable view.
 * Similar to the Bible's ChapterView but adapted for EGW structure.
 */

import { isChapterHeading } from '@bible/core/egw-db';
import type { ScrollBoxRenderable } from '@opentui/core';
import { For, Show } from 'solid-js';

import { useEGWNavigation } from '../../context/egw-navigation.js';
import { useTheme } from '../../context/theme.js';
import { useScrollSync } from '../../hooks/use-scroll-sync.js';
import { EGWParagraphView } from './paragraph.js';

export function EGWChapterView() {
  const { theme } = useTheme();
  const { loadingState, currentChapter, selectedIndexInChapter, currentBook } = useEGWNavigation();

  let scrollRef: ScrollBoxRenderable | undefined = undefined;

  // Sync scroll to selected paragraph within chapter
  useScrollSync(() => `para-${selectedIndexInChapter()}`, {
    getRef: () => scrollRef,
  });

  return (
    <Show
      when={loadingState()._tag === 'loaded' && currentChapter()}
      fallback={
        <box flexGrow={1} alignItems="center" justifyContent="center">
          <Show
            when={loadingState()._tag === 'loading'}
            fallback={
              <Show
                when={loadingState()._tag === 'error'}
                fallback={
                  <text fg={theme().textMuted}>
                    {currentBook() ? 'No paragraphs found' : 'Select a book to begin reading'}
                  </text>
                }
              >
                <text fg={theme().error}>
                  Error:{' '}
                  {(() => {
                    const s = loadingState();
                    return s._tag === 'error' ? s.error : '';
                  })()}
                </text>
              </Show>
            }
          >
            <text fg={theme().textMuted}>
              {(() => {
                const s = loadingState();
                return s._tag === 'loading' ? s.message : '';
              })()}
            </text>
          </Show>
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
        <For each={currentChapter()?.paragraphs}>
          {(paragraph, index) => (
            <Show when={!isChapterHeading(paragraph.elementType)}>
              <EGWParagraphView
                id={`para-${index()}`}
                paragraph={paragraph}
                isSelected={selectedIndexInChapter() === index()}
              />
            </Show>
          )}
        </For>
      </scrollbox>
    </Show>
  );
}
