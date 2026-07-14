import { formatBibleReference, Reference } from '@bible/core/bible';
import { CROSS_REF_TYPES } from '@bible/core/bible-cross-refs';
import type { MarginNote } from '@bible/core/bible-db';
import type { ScrollBoxRenderable } from '@opentui/core';
import { For, Show } from 'solid-js';

import { useTheme } from '../../../context/theme.js';
import { formatNoteType } from '../../bible/verse.js';
import { TYPE_BADGES, type CrossRefPreview } from './model.js';

export interface CrossRefsPageProps {
  readonly marginNotes: readonly MarginNote[];
  readonly refs: readonly CrossRefPreview[];
  readonly selectedIndex: number;
  readonly addingRef: boolean;
  readonly addRefInput: string;
  readonly typingMode: boolean;
  readonly typePickerIndex: number;
  readonly setScrollRef: (element: ScrollBoxRenderable) => void;
}

export function CrossRefsPage(props: CrossRefsPageProps) {
  const { theme } = useTheme();
  const hasMarginNotes = () => props.marginNotes.length > 0;
  const hasCrossRefs = () => props.refs.length > 0;

  return (
    <>
      <Show
        when={hasMarginNotes() || hasCrossRefs()}
        fallback={<text fg={theme().textMuted}>No cross-references or margin notes</text>}
      >
        <Show when={hasMarginNotes()}>
          <box flexDirection="column" marginBottom={1}>
            <text fg={theme().textMuted} marginBottom={0}>
              <strong>Margin Notes</strong>
            </text>
            <For each={props.marginNotes}>
              {(note, index) => (
                <text fg={theme().text} wrapMode="word">
                  <span style={{ fg: theme().accent }}>{index() + 1}.</span>{' '}
                  <span style={{ fg: theme().accentMuted }}>{formatNoteType(note.type)}</span>
                  {formatNoteType(note.type) ? ' ' : ''}
                  {note.text}
                </text>
              )}
            </For>
          </box>
        </Show>

        <Show when={hasCrossRefs()}>
          <box flexDirection="column">
            <text fg={theme().textMuted} marginBottom={0}>
              <strong>Cross-References</strong>
            </text>
            <scrollbox
              ref={props.setScrollRef}
              focused={false}
              style={{
                height: hasMarginNotes() ? 6 : 10,
                rootOptions: { backgroundColor: theme().backgroundPanel },
                wrapperOptions: { backgroundColor: theme().backgroundPanel },
                viewportOptions: { backgroundColor: theme().backgroundPanel },
                contentOptions: { backgroundColor: theme().backgroundPanel },
                scrollbarOptions: {
                  showArrows: false,
                  trackOptions: {
                    foregroundColor: theme().accent,
                    backgroundColor: theme().border,
                  },
                },
              }}
            >
              <For each={props.refs}>
                {(item, index) => {
                  const isSelected = () => index() === props.selectedIndex;
                  const start =
                    item.ref.verse === null
                      ? Reference.chapter(item.ref.book, item.ref.chapter)
                      : Reference.verse(item.ref.book, item.ref.chapter, item.ref.verse);
                  const reference =
                    start._tag === 'chapter' ||
                    item.ref.verseEnd === null ||
                    item.ref.verseEnd === item.ref.verse
                      ? start
                      : Reference.range(
                          start,
                          Reference.verse(item.ref.book, item.ref.chapter, item.ref.verseEnd),
                        );
                  const paddedRef = formatBibleReference(reference).padEnd(18, ' ');
                  const badge = item.ref.classification
                    ? TYPE_BADGES[item.ref.classification]
                    : null;
                  const prefix = item.ref.source === 'user' ? ' * ' : badge ? '' : '   ';
                  const badgeText = badge ? `[${badge.label}]` : '';

                  return (
                    <text
                      id={`crossref-${index()}`}
                      fg={isSelected() ? theme().accent : theme().textMuted}
                    >
                      {isSelected() ? '▶ ' : '  '}
                      {badge ? <span style={{ fg: badge.color }}>{badgeText}</span> : prefix}
                      {badge ? ' ' : ''}
                      <span style={{ fg: isSelected() ? theme().accent : theme().text }}>
                        {isSelected() ? <strong>{paddedRef}</strong> : paddedRef}
                      </span>
                      {item.preview}
                    </text>
                  );
                }}
              </For>
            </scrollbox>
          </box>
        </Show>
      </Show>

      <Show when={props.addingRef}>
        <box
          border
          borderColor={theme().borderFocused}
          paddingLeft={1}
          paddingRight={1}
          marginTop={1}
        >
          <text fg={theme().text}>
            Add ref:{' '}
            {props.addRefInput || (
              <span style={{ fg: theme().textMuted }}>Type reference (e.g. John 3:16)...</span>
            )}
            <span style={{ fg: theme().accent }}>_</span>
          </text>
        </box>
      </Show>

      <Show when={props.typingMode}>
        <box
          border
          borderColor={theme().borderFocused}
          paddingLeft={1}
          paddingRight={1}
          marginTop={1}
          flexDirection="row"
          gap={1}
        >
          <For each={[...CROSS_REF_TYPES]}>
            {(type, index) => {
              const badge = TYPE_BADGES[type];
              const isSelected = () => index() === props.typePickerIndex;
              return (
                <text fg={isSelected() ? badge.color : theme().textMuted}>
                  {isSelected() ? <strong>[{badge.label}]</strong> : ` ${badge.label} `}
                </text>
              );
            }}
          </For>
        </box>
      </Show>
    </>
  );
}
