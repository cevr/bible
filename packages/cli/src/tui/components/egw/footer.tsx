/**
 * EGW Footer
 *
 * Displays current refcode/position and keyboard shortcuts.
 * Similar layout to Bible reader footer.
 */

import { For, Show } from 'solid-js';

import { useEGWNavigation } from '../../context/egw-navigation.js';
import { useTheme } from '../../context/theme.js';
import type { GotoModeState } from '../../types/goto-mode.js';

const DEFAULT_HINTS = [
  { key: 'j/k', action: 'para' },
  { key: 'h/l', action: 'chapter' },
  { key: 'J/K', action: 'page' },
  { key: 'g{n}', action: 'goto' },
  { key: 'G', action: 'last' },
  { key: '^P', action: 'books' },
];

interface EGWFooterProps {
  gotoMode?: GotoModeState;
}

export function EGWFooter(props: EGWFooterProps) {
  const { theme } = useTheme();
  const { currentParagraph, currentChapter, selectedIndexInChapter } = useEGWNavigation();

  const refcode = () => {
    const para = currentParagraph();
    return para?.refcodeShort ?? para?.refcodeLong ?? '';
  };

  const chapterParagraphCount = () => currentChapter()?.paragraphs.length ?? 0;

  return (
    <box
      height={2}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
    >
      {/* Top row: refcode and position on left, pending goto on right */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="row" gap={2}>
          <Show when={refcode()}>
            <text fg={theme().text}>{refcode()}</text>
          </Show>
          <Show when={chapterParagraphCount() > 0}>
            <text fg={theme().textMuted}>
              <span style={{ fg: theme().accent }}>{selectedIndexInChapter() + 1}</span>/
              {chapterParagraphCount()}
            </text>
          </Show>
        </box>
        <Show when={props.gotoMode?._tag === 'awaiting'}>
          <text fg={theme().textHighlight}>
            <span style={{ fg: theme().accent }}>g</span>
            <strong>
              {props.gotoMode?._tag === 'awaiting' ? props.gotoMode.digits || '_' : ''}
            </strong>
          </text>
        </Show>
      </box>

      {/* Bottom row: key hints */}
      <box flexDirection="row" gap={3}>
        <For each={DEFAULT_HINTS}>
          {(hint) => (
            <text fg={theme().textMuted}>
              <span style={{ fg: theme().accent }}>{hint.key}</span>
              <span> {hint.action}</span>
            </text>
          )}
        </For>
      </box>
    </box>
  );
}
