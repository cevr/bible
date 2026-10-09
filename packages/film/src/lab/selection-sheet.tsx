// The Lab's inspector for what is selected (design language §7): on a
// laptop it stands in its place in the panel; on a phone (the studio's one
// breakpoint, `PHONE`) it stands in the shared sheet (`review/inspector.tsx`)
// while something is selected, peeking one line above the dock, opened whole
// by a tap on its head. Its open state is the selection, which the URL keeps
// (`?cue=`, `?knob=`, `?note=`): Back closes it as it unpicks, and its
// Close, Escape or a swipe unpicks by the sheets' one rule (`dismiss`). The
// sheet has a second face, the scene's code (Inspect · Source, `?code=`).

import { type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
import type { Host } from '../browser/host.ts';
import type { Hub } from '../command/hub.ts';
import type { Selection } from '../command/selection.ts';
import { Sheet } from './review/inspector.tsx';
import { PHONE, useMatches } from './viewport.ts';

/**
 * `children`, the inspector of `of` (none: nothing selected): in place, or on
 * a phone while something is selected in the sheet, its peek `peek` (one
 * line naming the selection and its values).
 */
export const SelectionSheet = (props: {
  readonly host: Host;
  readonly hub: Hub;
  readonly of: Option.Option<Selection>;
  readonly peek: string;
  readonly dismiss: () => void;
  readonly children: JSX.Element;
  /** The sheet's further faces around `children` (the editor's: Inspect · Source); without it the sheet shows `children` alone. */
  readonly faces?: (children: JSX.Element) => JSX.Element;
}) => {
  const phone = useMatches(props.host, PHONE);
  return (
    <Show
      when={Option.getOrUndefined(Option.filter(props.of, () => phone()))}
      fallback={props.children}
    >
      {(of) => (
        <Sheet
          host={props.host}
          hub={props.hub}
          of={of()}
          role="inspector"
          class="lab-selection-sheet"
          peeked
          title={props.peek}
          initialFocus={() => false}
          onClose={props.dismiss}
        >
          {Option.match(Option.fromUndefinedOr(props.faces), {
            onNone: () => props.children,
            onSome: (faces) => faces(props.children),
          })}
        </Sheet>
      )}
    </Show>
  );
};
