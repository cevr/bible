// Motion's section of the panel and its onion layer. The section sets the
// onion skin (on, how many frames either side, how many frames apart), the
// speed, and the loop (the selected cue, A, B, off); the layer paints the
// onion over the film on a paused frame. Both read Motion's context.

import { For } from '@solidjs/web';
import { Option } from 'effect';
import { createEffect, onCleanup } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { runScoped } from '../../browser/host.ts';
import { ONION_SCALE, makeOnion, whole } from '../../player/onion.ts';
import { RATES } from '../view-state.ts';
import { Lab, useLab } from '../shell.tsx';
import { useMotion } from './context.tsx';

interface SpreadFieldProps {
  readonly field: 'count' | 'spacing';
  readonly max: number;
}

/** How many frames either side the onion ghosts, or how many frames apart. */
const SpreadField = (props: SpreadFieldProps) => {
  const { state, actions } = useMotion();
  return (
    <input
      type="number"
      data-field={props.field}
      min="1"
      max={props.max}
      step="1"
      value={String(state.onion()[props.field])}
      onChange={(e) =>
        actions.setOnion({
          [props.field]: whole(e.currentTarget.value, state.onion()[props.field], props.max),
        })
      }
    />
  );
};

/** The onion, the speed and the loop. */
export const Section = () => {
  const { state, actions } = useMotion();
  return (
    <Lab.Section class="lab-motion">
      <header>
        <strong>Motion</strong>
        <span class="lab-motion-status">{state.status()}</span>
      </header>
      <div class="lab-motion-row">
        <button
          type="button"
          data-act="onion"
          class={{ on: state.onion().on }}
          title="ghost the frames around this one: warm before, cool after"
          onClick={() => actions.setOnion({ on: !state.onion().on })}
        >
          Onion
        </button>
        <label>
          ± <SpreadField field="count" max={4} />
        </label>
        <label>
          every <SpreadField field="spacing" max={15} /> f
        </label>
      </div>
      <div class="lab-motion-row" data-role="rates">
        <span class="lab-edit-key">speed</span>
        <For each={RATES}>
          {(r) => (
            <button
              type="button"
              data-rate={String(r)}
              class={{ on: state.rate() === r }}
              onClick={() => actions.setRate(r)}
            >
              {`${r}×`}
            </button>
          )}
        </For>
      </div>
      <div class="lab-motion-row">
        <span class="lab-edit-key">loop</span>
        <button
          type="button"
          data-act="loop-cue"
          disabled={Option.isNone(state.cue())}
          title={Option.match(state.cue(), {
            onNone: () => 'select a cue on the strip first',
            onSome: (c) => `loop ${c.name}'s span`,
          })}
          onClick={() => actions.loopCue()}
        >
          cue
        </button>
        <button type="button" data-act="a" title="set A to this frame" onClick={actions.markA}>
          A
        </button>
        <button type="button" data-act="b" title="set B to this frame" onClick={actions.markB}>
          B
        </button>
        <button type="button" data-act="loop-off" onClick={actions.stopLoop}>
          off
        </button>
      </div>
    </Lab.Section>
  );
};

/**
 * The onion skin, pinned over the film: painted once per frame drawn while
 * it is on and the film is paused, hidden otherwise.
 */
export const Onion = () => {
  const { state: lab, meta } = useLab();
  const { state } = useMotion();
  const { player } = meta;
  const painter = makeOnion(player);
  let layer = Option.none<{
    readonly el: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
  }>();
  const paint = () => {
    Option.map(layer, (l) => {
      const shown = state.onion().on && !player.playing();
      l.el.hidden = !shown;
      if (shown) painter.paint(l.ctx, state.onion());
    });
  };
  // Painted once a frame, however often it is asked for; not after the layer goes.
  const { value: repaint, close } = runScoped(meta.host)(Frames.use((f) => f.coalesce(paint)));
  onCleanup(close);
  createEffect(
    () => {
      lab.drawn();
      return state.onion();
    },
    () => repaint(),
  );
  return (
    <Lab.Layer
      class="lab-onion"
      scale={ONION_SCALE}
      hidden
      ref={(el) => {
        layer = Option.map(Option.fromNullishOr(el.getContext('2d')), (ctx) => ({ el, ctx }));
      }}
    />
  );
};
