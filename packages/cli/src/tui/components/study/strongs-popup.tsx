/**
 * Strong's Concordance Popup
 *
 * Shows Strong's definition for the currently selected word.
 * Displays Hebrew/Greek word, transliteration, pronunciation, and definition.
 */

import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import type { VerseWord } from '@bible/core/bible-db';
import { createMemo, For, Show } from 'solid-js';

import { useStudyData } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';

interface StrongsPopupProps {
  word: VerseWord;
  onClose: () => void;
}

export function StrongsPopup(props: StrongsPopupProps) {
  const { theme } = useTheme();
  const studyData = useStudyData();

  // Get Strong's entries for all numbers on this word
  const entries = createMemo(() => {
    if (!props.word.strongsNumbers) return [];
    return props.word.strongsNumbers
      .map((num) => studyData.concordance.entry(num))
      .filter((entry) => entry !== undefined);
  });

  useModalKeyboard((key) => {
    if (key.name === 'escape' || key.name === 'return') {
      props.onClose();
      return;
    }
  });

  const isHebrew = (num: string) => num.startsWith('H');

  return (
    <box
      flexDirection="column"
      border
      borderColor={theme().border}
      backgroundColor={theme().backgroundPanel}
      width={65}
      maxHeight={25}
      padding={1}
    >
      {/* Header */}
      <box marginBottom={1}>
        <text fg={theme().accent}>
          <strong>"{props.word.text}"</strong>
        </text>
        <Show when={props.word.strongsNumbers}>
          <text fg={theme().textMuted}> ({props.word.strongsNumbers?.join(', ')})</text>
        </Show>
      </box>

      {/* Definitions */}
      <Show
        when={entries().length > 0}
        fallback={
          <text fg={theme().textMuted}>No Strong's definition available for this word.</text>
        }
      >
        <box flexDirection="column">
          <For each={entries()}>
            {(entry) => (
              <box flexDirection="column">
                {/* Strong's Number and Language */}
                <box>
                  <text fg={isHebrew(entry.number) ? theme().warning : theme().accent}>
                    <strong>{entry.number}</strong>
                  </text>
                  <text fg={theme().textMuted}>
                    {' '}
                    ({isHebrew(entry.number) ? 'Hebrew' : 'Greek'})
                  </text>
                </box>

                {/* Original Word with Transliteration */}
                <Show when={entry.transliteration || entry.lemma}>
                  <box>
                    <text fg={theme().textMuted}>Word: </text>
                    <text fg={theme().text}>
                      <strong>{entry.transliteration || entry.lemma}</strong>
                      <Show when={entry.transliteration && entry.lemma}>
                        <span style={{ fg: theme().textMuted }}> ({entry.lemma})</span>
                      </Show>
                    </text>
                  </box>
                </Show>

                {/* Pronunciation */}
                <Show when={entry.pronunciation}>
                  <box>
                    <text fg={theme().textMuted}>Pronunciation: </text>
                    <text fg={theme().text}>{entry.pronunciation}</text>
                  </box>
                </Show>

                {/* Definition */}
                <Show when={entry.definition}>
                  <box marginTop={1}>
                    <text fg={theme().textMuted}>Definition: </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={theme().text} wrapMode="word">
                      {entry.definition}
                    </text>
                  </box>
                </Show>

                {/* KJV Usage */}
                <Show when={entry.kjvDefinition}>
                  <box marginTop={1}>
                    <text fg={theme().textMuted}>KJV Usage: </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={theme().text} wrapMode="word">
                      {entry.kjvDefinition}
                    </text>
                  </box>
                </Show>
              </box>
            )}
          </For>
        </box>
      </Show>

      {/* Footer */}
      <box marginTop={1}>
        <text fg={theme().textMuted}>Esc/Enter close</text>
      </box>
    </box>
  );
}
