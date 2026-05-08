import { For, Show } from 'solid-js';

import { useNavigation } from '../../context/navigation.js';
import { useTheme } from '../../context/theme.js';
import type { GotoModeState } from '../../types/goto-mode.js';

interface FooterProps {
  hints?: Array<{ key: string; action: string }>;
  gotoMode?: GotoModeState;
}

const DEFAULT_HINTS = [
  { key: 'j/k', action: 'verse' },
  { key: 'h/l', action: 'chapter' },
  { key: 'g{n}', action: 'goto' },
  { key: 'G', action: 'last' },
  { key: '^P', action: 'search' },
  { key: '^T', action: 'tools' },
];

export function Footer(props: FooterProps) {
  const { theme } = useTheme();
  const { selectedVerse, totalVerses } = useNavigation();
  const hints = () => props.hints ?? DEFAULT_HINTS;

  return (
    <box
      height={2}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
    >
      {/* Top row: verse position and pending goto */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().accent }}>{selectedVerse()}</span>/{totalVerses()}
        </text>
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
        <For each={hints()}>
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
