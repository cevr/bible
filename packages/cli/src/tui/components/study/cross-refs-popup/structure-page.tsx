import type { StrongsEntry } from '@bible/core/bible-db';
import type { WordFrequencyEntry } from '@bible/core/structural-analysis';
import type { ScrollBoxRenderable } from '@opentui/core';
import { For, Show } from 'solid-js';

import { useTheme } from '../../../context/theme.js';

export interface StructurePageProps {
  readonly words: readonly WordFrequencyEntry[];
  readonly strongs: readonly StrongsEntry[];
  readonly hasStructure: boolean;
  readonly loading: boolean;
  readonly selectedIndex: number;
  readonly setScrollRef: (element: ScrollBoxRenderable) => void;
}

export function StructurePage(props: StructurePageProps) {
  const { theme } = useTheme();

  return (
    <Show
      when={!props.loading}
      fallback={<text fg={theme().textMuted}>Loading structural data...</text>}
    >
      <Show
        when={props.hasStructure}
        fallback={<text fg={theme().textMuted}>No structural data available</text>}
      >
        <scrollbox
          ref={props.setScrollRef}
          focused={false}
          style={{
            height: 12,
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
          {/* Word Frequency */}
          <Show when={props.words.length > 0}>
            <text fg={theme().textMuted} marginBottom={0}>
              <strong>Word Frequency</strong>
            </text>
            <For each={props.words}>
              {(entry, index) => {
                const isSelected = () => index() === props.selectedIndex;
                const symbolic = entry.symbolicCount !== null;
                return (
                  <text
                    id={`structure-${index()}`}
                    fg={symbolic ? theme().accent : isSelected() ? theme().text : theme().textMuted}
                  >
                    {isSelected() ? '▶ ' : '  '}
                    {entry.word.padEnd(20, ' ')} {String(entry.count).padStart(3, ' ')}x
                    {symbolic ? ` (${entry.symbolicCount})` : ''}
                  </text>
                );
              }}
            </For>
          </Show>

          {/* Strong's Entries for current verse */}
          <Show when={props.strongs.length > 0}>
            <text fg={theme().textMuted} marginTop={1} marginBottom={0}>
              <strong>Strong's (this verse)</strong>
            </text>
            <For each={props.strongs}>
              {(entry, index) => {
                const globalIdx = () => props.words.length + index();
                const isSelected = () => globalIdx() === props.selectedIndex;
                const lang = entry.number.startsWith('H') ? 'Heb' : 'Grk';
                return (
                  <box
                    id={`structure-${globalIdx()}`}
                    flexDirection="column"
                    marginBottom={0}
                    backgroundColor={isSelected() ? theme().verseHighlight : undefined}
                    paddingLeft={1}
                  >
                    <text fg={isSelected() ? theme().accent : theme().textMuted}>
                      {entry.number} [{lang}] {entry.lemma} ({entry.transliteration ?? entry.lemma})
                    </text>
                    <text fg={theme().text} wrapMode="word">
                      {entry.definition.slice(0, 120)}
                      {entry.definition.length > 120 ? '...' : ''}
                    </text>
                  </box>
                );
              }}
            </For>
          </Show>
        </scrollbox>
      </Show>
    </Show>
  );
}
