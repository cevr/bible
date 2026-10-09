// A cue's or a knob's place in its scene's file, `scenes/robe.ts:42`, as the
// inspector prints it: a tap opens the Source view held on that line
// (`?code=42`), so a phone reaches the code from the thing it is editing. The
// place comes from the small source answer, so it stands before the code is read.

import { Show } from '@solidjs/web';
import { Boolean as Bool, Option } from 'effect';
import { createMemo } from 'solid-js';
import { useLab } from '../shell.tsx';
import { useSource } from './context.tsx';
import { lineOpen } from './open.ts';

/** The `file:line` that writes cue or knob `name` of `scene`, once it is known. */
export const At = (props: {
  readonly of: 'cue' | 'knob';
  readonly scene: string;
  readonly name: string;
}) => {
  const { actions } = useLab();
  const source = useSource();
  const where = createMemo(() =>
    Bool.match(props.of === 'cue', {
      onTrue: () => source.whereCue(props.scene, props.name),
      onFalse: () => source.whereKnob(props.scene, props.name),
    }),
  );
  return (
    <Show when={Option.getOrUndefined(where())}>
      {(at) => (
        <button
          type="button"
          class="lab-source-at"
          data-act="open-source"
          title="Show this in the scene's code"
          onClick={() => actions.showCode(Option.some(lineOpen(at().line)))}
        >
          {`${at().file}:${at().line}`}
        </button>
      )}
    </Show>
  );
};
