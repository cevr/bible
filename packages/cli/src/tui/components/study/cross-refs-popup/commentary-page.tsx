import type { CommentaryEntry } from '@bible/core/egw-commentary';
import type { ScrollBoxRenderable } from '@opentui/core';
import { For, Show } from 'solid-js';

import { useTheme } from '../../../context/theme.js';

export interface CommentaryPageProps {
  readonly entries: readonly CommentaryEntry[];
  readonly loading: boolean;
  readonly selectedIndex: number;
  readonly setScrollRef: (element: ScrollBoxRenderable) => void;
}

export function CommentaryPage(props: CommentaryPageProps) {
  const { theme } = useTheme();
  const hasCommentary = () => props.entries.length > 0;

  return (
    <Show
      when={!props.loading}
      fallback={<text fg={theme().textMuted}>Loading EGW Commentary...</text>}
    >
      <Show
        when={hasCommentary()}
        fallback={<text fg={theme().textMuted}>No EGW commentary found for this verse</text>}
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
          <For each={props.entries}>
            {(entry, index) => {
              const isSelected = () => index() === props.selectedIndex;
              return (
                <box
                  id={`commentary-${index()}`}
                  flexDirection="column"
                  marginBottom={1}
                  backgroundColor={isSelected() ? theme().verseHighlight : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text fg={isSelected() ? theme().accent : theme().textMuted}>
                    {isSelected() ? <strong>{entry.refcode}</strong> : entry.refcode}
                  </text>
                  <text fg={theme().text} wrapMode="word">
                    {entry.content.slice(0, 200)}
                    {entry.content.length > 200 ? '...' : ''}
                  </text>
                </box>
              );
            }}
          </For>
        </scrollbox>
      </Show>
    </Show>
  );
}
