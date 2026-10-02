// Compare's section of the panel, its HEAD layer and the wipe's divider. The
// section picks the mode; the layer draws the frame shown with HEAD's
// timeline and knobs through today's code (`film.render(…, { edits })`, over
// whatever else the lab previews; one frame, nothing kept), clipped left of the divider in a wipe and shown on
// HEAD's side of a blink; the divider, on the overlay, drags the wipe.

import { For, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import type { Accessor } from 'solid-js';
import { createEffect, onCleanup } from 'solid-js';
import { Pointer } from '../../browser/pointer.ts';
import { Lab, useLab } from '../shell.tsx';
import { useCompare } from './context.tsx';
import { CompareMode } from './machine.ts';

const TITLES = {
  off: 'draw only now',
  wipe: 'HEAD left of the divider, now right of it',
  blink: 'flip between HEAD and now',
} as const satisfies Record<CompareMode, string>;

/** Off, wipe or blink, and what the compare says. */
export const Section = () => {
  const { state, actions } = useCompare();
  return (
    <Lab.Section class="lab-compare-tools">
      <header>
        <strong>Compare</strong>
        <span class="lab-edit-key">with HEAD</span>
      </header>
      <div class="lab-motion-row">
        <For each={CompareMode.literals}>
          {(m) => (
            <button
              type="button"
              data-mode={m}
              class={{ on: state.mode() === m }}
              title={TITLES[m]}
              onClick={() => actions.choose(m)}
            >
              {m}
            </button>
          )}
        </For>
      </div>
      <p class="lab-edit-note lab-compare-status">{state.status()}</p>
    </Lab.Section>
  );
};

/** The frame as HEAD declared it, pinned over the film. */
export const Layer = () => {
  const { state: lab, meta } = useLab();
  const { state } = useCompare();
  const { film, player } = meta;
  let layer = Option.none<{
    readonly el: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
  }>();
  let frame = Option.none<number>();
  const paint = () => {
    frame = Option.none();
    Option.map(layer, (l) => {
      const shows = state.layer();
      const shown = Option.filter(state.edit(), () => shows !== 'hidden');
      l.el.hidden = Option.isNone(shown) || shows !== 'head';
      Option.map(shown, (edit) => {
        film.render(l.ctx, player.now(), {
          captions: player.captions.on,
          edits: new Map([...player.edits(), [state.scene(), edit]]),
        });
        // Clipped left of the divider in a wipe; whole otherwise.
        l.el.style.clipPath = Option.match(state.split(), {
          onNone: () => '',
          onSome: (split) => `inset(0 ${(1 - split) * 100}% 0 0)`,
        });
      });
    });
  };
  createEffect(
    () => {
      lab.drawn();
      return [state.layer(), state.split(), state.edit()] as const;
    },
    () => {
      if (Option.isSome(frame)) return;
      frame = Option.some(requestAnimationFrame(paint));
    },
  );
  onCleanup(() => Option.map(frame, cancelAnimationFrame));
  return (
    <Lab.Layer
      class="lab-compare"
      hidden
      ref={(el) => {
        layer = Option.map(Option.fromNullishOr(el.getContext('2d')), (ctx) => ({ el, ctx }));
      }}
    />
  );
};

/** The wipe's divider on the overlay: a line through the frame, and a grip to drag it by. */
export const Divider = () => {
  const { meta } = useLab();
  const { state, actions } = useCompare();
  const { film } = meta;
  // The wipe, as an object: a divider at 0 is still shown.
  const wipe = () =>
    Option.getOrUndefined(Option.map(state.split(), (split) => ({ x: split * film.width })));
  const grab = (el: SVGCircleElement) =>
    el.addEventListener('pointerdown', (e) => {
      // The divider, not a note: the overlay never sees this press.
      e.stopPropagation();
      e.preventDefault();
      Option.map(Option.fromNullishOr(el.ownerSVGElement), (svg) => {
        const r = svg.getBoundingClientRect();
        const move = (ev: PointerEvent) => actions.split((ev.clientX - r.left) / r.width);
        // The divider stays where the drag ends, lifted or ended by the browser.
        Effect.runForkWith(meta.host)(
          Pointer.use((pointer) => pointer.drag(e, { move, end: () => {} })),
        );
      });
    });
  return (
    <Show when={wipe()}>
      {(w: Accessor<{ readonly x: number }>) => (
        <g class="lab-divider">
          <line x1={w().x} x2={w().x} y1="0" y2={film.height} />
          <circle cx={w().x} cy={film.height / 2} r="22" ref={grab} />
          <text x={w().x - 16} y="44" text-anchor="end">
            HEAD
          </text>
          <text x={w().x + 16} y="44">
            now
          </text>
        </g>
      )}
    </Show>
  );
};
