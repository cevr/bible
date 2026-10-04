// A scene's card (design language §6, One surface): the same card wherever a
// scene is shown whole, the Scenes page's focus panel and the Project's grid.
// Its picture (a slot: the live frame on Scenes, the render's frame on the
// Project), the scene's hue and name, its act and its in, out and length as
// timecode, its marks as chips (`marks.ts`), a slot for its verb (Open in
// Lab, Approve) and, below, whatever the page shows of the scene in its
// inspector. The card is the scene's `Target`: a right-click or a long press
// on it opens the scene's commands. `tile` is the grid's size, `focus` the
// inspector's.

import { For, type JSX, Show } from '@solidjs/web';
import { Option } from 'effect';
import { Selection } from '../../command/selection.ts';
import { timecode } from '../../core/time.ts';
import { Target } from '../command/context-menu.tsx';
import { type SceneMarks, chipsOf } from './marks.ts';

/** Scene `i`'s hue, as every band, dot and rule of it is drawn: from the tokens' saturation and lightness. */
export const sceneHue = (i: number): string =>
  `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;

interface SceneCardProps {
  readonly film: string;
  readonly scene: string;
  /** The scene's place in the film, from 0: its hue. */
  readonly index: number;
  /** Where it starts and how long it lasts, in film seconds, and the film's frame rate. */
  readonly start: number;
  readonly dur: number;
  readonly fps: number;
  readonly marks: SceneMarks;
  readonly size: 'tile' | 'focus';
  /** The card's picture. */
  readonly picture: JSX.Element;
  /** The card's verb (Open in Lab, Approve). */
  readonly verb?: JSX.Element;
  /** Whether it is the one selected. */
  readonly selected?: boolean;
  /** What the page shows of the scene below its head. */
  readonly children?: JSX.Element;
}

/** A scene's card. */
export const SceneCard = (props: SceneCardProps) => (
  <Target
    of={Selection.cases.Scene.make({ film: props.film, scene: props.scene })}
    class="sc-card"
    data-size={props.size}
    data-scene={props.scene}
    data-selected={String(props.selected === true)}
  >
    <div class="sc-card-picture">
      {props.picture}
      <Show when={props.size === 'tile'}>
        <span class="sc-card-length">{timecode(props.dur, props.fps)}</span>
      </Show>
    </div>
    <div class="sc-card-head">
      <span class="sc-hue" style={{ background: sceneHue(props.index) }} />
      <span class="sc-card-name">{props.scene}</span>
    </div>
    <Show when={props.size === 'focus'}>
      <dl class="sc-card-facts">
        <Show when={Option.getOrUndefined(props.marks.act)}>
          {(act) => (
            <>
              <dt>act</dt>
              <dd>{act()}</dd>
            </>
          )}
        </Show>
        <dt>in</dt>
        <dd data-fact="in">{timecode(props.start, props.fps)}</dd>
        <dt>out</dt>
        <dd data-fact="out">{timecode(props.start + props.dur, props.fps)}</dd>
        <dt>length</dt>
        <dd data-fact="length">{timecode(props.dur, props.fps)}</dd>
      </dl>
    </Show>
    <div class="sc-chips">
      <For each={chipsOf(props.marks)} keyed={(c) => c.mark}>
        {(chip) => (
          <span class="sc-chip" data-mark={chip().mark} data-state={chip().state}>
            {chip().text}
          </span>
        )}
      </For>
    </div>
    <Show when={props.verb}>
      <div class="sc-card-verb">{props.verb}</div>
    </Show>
    {props.children}
  </Target>
);
