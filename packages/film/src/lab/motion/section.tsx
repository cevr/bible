// Motion's section of the panel and its onion layer. The section sets the
// onion skin (on, through its command; how many frames either side, how many frames apart), the
// speed and the loop, each one chip opening its commands (the rate chip:
// ¼×, ½×, 1×; the loop chip: the selected cue, this scene, the in and out
// points, off; `commands.ts`); the layer paints the
// onion over the film on a paused frame. Both read Motion's context.

import { Option } from 'effect';
import { createEffect, onCleanup } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { runScoped } from '../../browser/host.ts';
import { ONION_SCALE, makeOnion } from '../../player/onion.ts';
import { RATES } from '../view-state.ts';
import { rateId, rateText, rateTitle } from '../../player/transport.ts';
import { hubKeys } from '../command/changes.ts';
import { CommandChip } from '../command/command-chip.tsx';
import { BY_BUTTON } from '../../command/command.ts';
import { LOOP_IDS, ONION } from './commands.ts';
import { Lab, useLab } from '../shell.tsx';
import { useMotion } from './context.tsx';

/** A whole-number field from 1 to `max`, `fallback` when it is empty or not a number. */
const whole = (value: string, fallback: number, max: number) =>
  Math.max(1, Math.min(max, Math.round(Number(value) || fallback)));

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

/** The onion, the speed and the loop, in Motion's section of the page's panel. */
export const Section = () => {
  const { state } = useMotion();
  const { meta } = useLab();
  // The chips name their keys as bound now: a rebound key reads as rebound.
  const keys = hubKeys(meta.hub);
  return (
    <>
      <Lab.Fill at="motion-head">
        <span class="lab-motion-status">{state.status()}</span>
      </Lab.Fill>
      <Lab.Fill at="motion">
        <div class="lab-motion-row">
          <button
            type="button"
            data-act="onion"
            class={{ on: state.onion().on }}
            title={keys.titled('ghost the frames around this one: warm before, cool after', ONION)}
            onClick={() => meta.hub.invokeId(ONION, BY_BUTTON)}
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
        <div class="lab-motion-row">
          <CommandChip
            hub={meta.hub}
            ids={RATES.map(rateId)}
            act="rate"
            title={rateTitle(keys.titled)}
          >
            <span data-rate={String(state.rate())}>{rateText(state.rate())}</span>
          </CommandChip>
          <CommandChip
            hub={meta.hub}
            ids={LOOP_IDS}
            act="loop"
            title={`Loop ${keys.titled('the selected cue', 'motion.loop-cue')}, this scene, or ${keys.titled('in', 'motion.in')} to ${keys.titled('out', 'motion.out')}`}
          >
            Loop…
          </CommandChip>
        </div>
      </Lab.Fill>
    </>
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
