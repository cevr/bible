// Compare's section of the panel, its HEAD layer and the wipe's divider. The
// section picks the mode; the layer draws the frame shown with HEAD's
// timeline and knobs through today's code (`film.render(…, { edits })`, over
// whatever else the lab previews; one frame, nothing kept), clipped left of
// the divider in a wipe, shown on HEAD's side of a blink, and laid over the
// frame in the difference blend in a diff (PA-9: black where nothing moved).
// On the overlay, the divider drags the wipe, and in a blink a press held on
// the frame shows HEAD until it lifts (the blink by hand, a phone's way).

import { For, Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import type { Accessor } from 'solid-js';
import { createEffect, createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import { runScoped } from '../../browser/host.ts';
import { Pointer } from '../../browser/pointer.ts';
import { useLabPage } from '../panel.tsx';
import { Lab, useLab } from '../shell.tsx';
import { wipeCommands } from '../wipe-keys.ts';
import { useCompare } from './context.tsx';
import { CompareMode } from './machine.ts';

const TITLES = {
  off: 'draw only now',
  wipe: 'HEAD left of the divider, now right of it',
  blink: 'flip between HEAD and now; press and hold the frame to hold HEAD',
  diff: 'HEAD over now in the difference blend: black where nothing moved',
} as const satisfies Record<CompareMode, string>;

/** Off, wipe, blink or diff, and what the compare says, in Compare's section of the page's panel. */
export const Section = () => {
  const { state, actions } = useCompare();
  return (
    <Lab.Fill at="compare">
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
    </Lab.Fill>
  );
};

/** The frame as HEAD declared it, pinned over the film. */
export const Layer = () => {
  const { state: lab, meta } = useLab();
  const { state } = useCompare();
  const { player } = meta;
  let layer = Option.none<{
    readonly el: HTMLCanvasElement;
    readonly ctx: CanvasRenderingContext2D;
  }>();
  const paint = () => {
    Option.map(layer, (l) => {
      const shows = state.layer();
      const shown = Option.filter(state.edit(), () => shows !== 'hidden');
      l.el.hidden = Option.isNone(shown) || shows !== 'head';
      Option.map(shown, (edit) => {
        player.renderShown(l.ctx, player.now(), new Map([[state.scene(), edit]]));
        // Clipped left of the divider in a wipe; whole otherwise; in the difference blend in a diff.
        l.el.style.mixBlendMode = state.blend();
        l.el.style.clipPath = Option.match(state.split(), {
          onNone: () => '',
          onSome: (split) => `inset(0 ${(1 - split) * 100}% 0 0)`,
        });
      });
    });
  };
  // Painted once a frame, however often it is asked for; not after the layer goes.
  const { value: repaint, close } = runScoped(meta.host)(Frames.use((f) => f.coalesce(paint)));
  onCleanup(close);
  createEffect(
    () => {
      lab.drawn();
      return [state.layer(), state.split(), state.blend(), state.edit()] as const;
    },
    () => repaint(),
  );
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

/**
 * The blink by hand, on the overlay (PA-9): while Compare is the tool shown
 * and the blink is on, a press on the frame holds HEAD until it lifts, or
 * until the browser takes it. A finger's press never draws a note here: the
 * overlay never sees it.
 */
export const Hold = () => {
  const { meta } = useLab();
  const page = useLabPage();
  const { state, actions } = useCompare();
  const { film } = meta;
  const shown = () => state.mode() === 'blink' && page.mode() === 'compare';
  const press = (el: SVGRectElement) =>
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      actions.hold(true);
      Effect.runForkWith(meta.host)(
        Pointer.use((pointer) =>
          pointer.drag(e, { move: () => {}, end: () => actions.hold(false) }),
        ),
      );
    });
  return (
    <Show when={shown()}>
      <rect class="lab-hold" x="0" y="0" width={film.width} height={film.height} ref={press}>
        <title>press and hold to hold HEAD</title>
      </rect>
    </Show>
  );
};

/** The grip's radius as it is drawn, in the picture's units. */
const GRIP_R = 22;

/**
 * The wipe's divider on the overlay: a line through the frame, and a grip to
 * drag it by. The grip is a slider: dragged, or ←/→ a hundredth of the frame
 * (⇧ ten), Home and End to its edges. Drawn at the picture's size, it takes
 * a finger's press (`--hit`) however small the picture shows.
 */
export const Divider = () => {
  const { meta } = useLab();
  const { state, actions } = useCompare();
  const { film } = meta;
  // The wipe, as an object: a divider at 0 is still shown.
  const wipe = () =>
    Option.getOrUndefined(Option.map(state.split(), (split) => ({ x: split * film.width })));
  // The grip by the keyboard, while it has focus: ←/→ (⇧ ten, ⌥ a thousandth), Home and End.
  onCleanup(
    meta.hub.commands.register(
      ...wipeCommands(
        'compare',
        () => Option.getOrElse(untrack(state.split), () => 0.5),
        actions.split,
      ),
    ),
  );
  return (
    <Show when={wipe()}>
      {(w: Accessor<{ readonly x: number }>) => (
        <g class="lab-divider">
          <line x1={w().x} x2={w().x} y1="0" y2={film.height} />
          <Grip x={w().x} />
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

/** The divider's grip at `x`: drawn at the picture's size, reaching `--hit` px across on screen. */
const Grip = (props: { readonly x: number }) => {
  const { meta } = useLab();
  const { state, actions } = useCompare();
  const { film } = meta;
  /** The grip's reach, in the picture's units: `--hit` px across on screen, never less than it is drawn. */
  const [reach, setReach] = createSignal(GRIP_R, { ownedWrite: true });
  let hitArea = Option.none<SVGCircleElement>();
  const fit = (svg: SVGSVGElement) => {
    const shown = svg.getBoundingClientRect().width;
    const hit = Number.parseFloat(getComputedStyle(svg).getPropertyValue('--hit'));
    if (shown > 0 && Number.isFinite(hit))
      setReach(Math.max(GRIP_R, (hit / 2) * (film.width / shown)));
  };
  // Once the grip is on the overlay, its reach follows the overlay's size on screen.
  onSettled(() =>
    Option.getOrUndefined(
      Option.map(
        Option.flatMap(hitArea, (el) => Option.fromNullishOr(el.ownerSVGElement)),
        (svg) => {
          fit(svg);
          const sized = new ResizeObserver(() => fit(svg));
          sized.observe(svg);
          return () => sized.disconnect();
        },
      ),
    ),
  );
  const grab = (el: SVGCircleElement) => {
    hitArea = Option.some(el);
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
  };
  const percent = () => Math.round(Option.getOrElse(state.split(), () => 0.5) * 100);
  return (
    <>
      <circle class="lab-divider-grip" cx={props.x} cy={film.height / 2} r={GRIP_R} />
      <circle
        class="lab-divider-hit"
        cx={props.x}
        cy={film.height / 2}
        r={reach()}
        role="slider"
        tabindex="0"
        aria-label="Wipe"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent()}
        aria-valuetext={`${percent()}% of the frame shows HEAD`}
        ref={grab}
      >
        <title>Drag the wipe, or move it with ←/→ (⇧ ten), Home and End</title>
      </circle>
    </>
  );
};
