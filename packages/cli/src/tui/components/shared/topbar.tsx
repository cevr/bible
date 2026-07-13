import { Reference } from '@bible/core/bible';

import { useBibleReader } from '../../context/bible.js';
import { useNavigation } from '../../context/navigation.js';
import { useTheme } from '../../context/theme.js';

export function Topbar() {
  const { theme } = useTheme();
  const { position } = useNavigation();
  const reader = useBibleReader();

  const book = () => reader.book(Reference.book(position().book));
  const bookName = () => book()?.name ?? 'Unknown';

  return (
    <box
      height={1}
      paddingLeft={2}
      paddingRight={2}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme().backgroundPanel}
    >
      <text fg={theme().textHighlight}>
        <strong>{bookName()}</strong>
        <span style={{ fg: theme().textMuted }}> </span>
        <strong>{position().chapter}</strong>
      </text>
    </box>
  );
}
