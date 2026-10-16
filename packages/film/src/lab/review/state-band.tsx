// A film's state band, as a Films card draws it: a segment a scene in film
// order, as wide as the scene is long (alike while lengths are unknown), in
// its most pressing state's colour (`bandState`), else its hue.

import { For } from '@solidjs/web';
import { Option } from 'effect';
import type { ProjectScene } from '../../core/catalogue.ts';
import { bandState } from '../scenes/marks.ts';

/** Scene `i`'s hue, as its band segment is drawn: from the tokens' saturation and lightness. */
const sceneHue = (i: number): string =>
  `hsl(${(i * 47) % 360} var(--scene-sat) var(--scene-light))`;

/** A film's state band: each scene a segment, in its state's colour, else its hue. */
export const StateBand = (props: { readonly scenes: ReadonlyArray<ProjectScene> }) => (
  <div class="pj-band" aria-hidden="true">
    <For each={props.scenes} keyed={(s) => s.scene}>
      {(scene, i) => (
        <span
          data-scene={scene().scene}
          data-state={Option.getOrElse(bandState(scene()), () => 'none')}
          style={{
            'flex-grow': String(
              Option.getOrElse(
                Option.map(scene().span, (s) => s.dur),
                () => 1,
              ),
            ),
            '--hue': sceneHue(i()),
          }}
        />
      )}
    </For>
  </div>
);
