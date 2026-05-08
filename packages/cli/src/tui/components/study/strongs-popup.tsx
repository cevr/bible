/**
 * Strong's Concordance Popup
 *
 * Shows Strong's definition for the currently selected word.
 * Displays Hebrew/Greek word, transliteration, pronunciation, and definition.
 */

import { useModalKeyboard } from '../../hooks/use-modal-keyboard.js';
import { createMemo, For, Show } from 'solid-js';

import { useStudyData, type WordWithStrongs } from '../../context/study-data.js';
import { useTheme } from '../../context/theme.js';

interface StrongsPopupProps {
  word: WordWithStrongs;
  onClose: () => void;
}

export function StrongsPopup(props: StrongsPopupProps) {
  const { theme } = useTheme();
  const studyData = useStudyData();

  // Get Strong's entries for all numbers on this word
  const entries = createMemo(() => {
    if (!props.word.strongs) return [];
    return props.word.strongs
      .map((num) => studyData.getStrongsEntry(num))
      .filter((e): e is NonNullable<typeof e> => e !== null);
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
        <Show when={props.word.strongs}>
          <text fg={theme().textMuted}> ({props.word.strongs?.join(', ')})</text>
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
                <Show when={entry.xlit || entry.lemma}>
                  <box>
                    <text fg={theme().textMuted}>Word: </text>
                    <text fg={theme().text}>
                      <strong>{entry.xlit || entry.lemma}</strong>
                      <Show when={entry.xlit && entry.lemma}>
                        <span style={{ fg: theme().textMuted }}> ({entry.lemma})</span>
                      </Show>
                    </text>
                  </box>
                </Show>

                {/* Pronunciation */}
                <Show when={entry.pron}>
                  <box>
                    <text fg={theme().textMuted}>Pronunciation: </text>
                    <text fg={theme().text}>{entry.pron}</text>
                  </box>
                </Show>

                {/* Definition */}
                <Show when={entry.def}>
                  <box marginTop={1}>
                    <text fg={theme().textMuted}>Definition: </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={theme().text} wrapMode="word">
                      {entry.def}
                    </text>
                  </box>
                </Show>

                {/* KJV Usage */}
                <Show when={entry.kjvDef}>
                  <box marginTop={1}>
                    <text fg={theme().textMuted}>KJV Usage: </text>
                  </box>
                  <box paddingLeft={2}>
                    <text fg={theme().text} wrapMode="word">
                      {entry.kjvDef}
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
