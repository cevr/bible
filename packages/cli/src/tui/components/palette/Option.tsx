import { Show } from 'solid-js';

import { useTheme } from '../../context/theme.js';
import type { CommandOption } from './context.js';

interface PaletteOptionProps {
  option: CommandOption;
  isSelected: boolean;
  descriptionMaxLength?: number;
}

/**
 * Single option in the palette list.
 * Pure presentational component - receives all data via props.
 */
export function PaletteOption(props: PaletteOptionProps) {
  const { theme } = useTheme();
  const maxLen = () => props.descriptionMaxLength ?? 35;

  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      paddingLeft={2}
      paddingRight={1}
      backgroundColor={props.isSelected ? theme().accent : undefined}
    >
      <text fg={props.isSelected ? theme().background : theme().text}>{props.option.label}</text>
      <Show when={props.option.description}>
        <text fg={props.isSelected ? theme().background : theme().textMuted}>
          {props.option.description?.slice(0, maxLen())}
        </text>
      </Show>
    </box>
  );
}

interface PaletteGroupHeaderProps {
  label: string;
  isFirst?: boolean;
}

/**
 * Group header separator in the palette list.
 */
export function PaletteGroupHeader(props: PaletteGroupHeaderProps) {
  const { theme } = useTheme();

  return (
    <box paddingLeft={1} marginTop={props.isFirst ? 0 : 1}>
      <text fg={theme().textMuted}>
        <strong>{props.label}</strong>
      </text>
    </box>
  );
}
