// The header's view menu, `⋯` (design language §4): how the page shows
// itself, on every page in the shell. Its rows are the page's own commands of
// the `View` group available now (captions, quality, findings, a filter,
// refresh, whatever the page registered), then Keyboard shortcuts
// (`viewRows`); each with its keys, run as a command menu's rows are
// (`command-chip.tsx` `RowsMenu`).

import { Option } from 'effect';
import type { Hub } from '../../command/hub.ts';
import { viewRows } from '../../command/menu.ts';
import { KEYS_SHEET_COMMAND } from './keys-sheet.tsx';
import { RowsMenu } from './command-chip.tsx';

/** The `⋯` button and its menu, for `hub`'s page. */
export const ViewMenu = (props: { readonly hub: Hub }) => (
  <RowsMenu
    hub={props.hub}
    rows={(available, ctx) =>
      viewRows(available, ctx, Option.toArray(props.hub.commands.byId(KEYS_SHEET_COMMAND)))
    }
    role="view-menu"
    align="end"
    title="View"
    label="View menu"
    act="view-menu"
    class="sh-tool"
  >
    <svg class="sh-icon sh-dots" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  </RowsMenu>
);
