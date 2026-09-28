// The lab page's entry: stage the film, mount the framework-free preview
// player (`mountPreview`), and render the lab's Solid panels around it. The
// player page (`/`), which the renderer loads, never imports this.

import { render } from '@solidjs/web';
import { Effect, Option, Schema } from 'effect';
import { onSettled } from 'solid-js';
import { type Films, type Player, mountPreview, showFailure, stageFilm } from '../player/main.ts';
import { type LegacyHost, mountLegacy } from './legacy.ts';
import { Lab, useLab } from './shell.tsx';

/** The lab page could not start: the film did not load, or the page has no such film. */
export class LabStartFailed extends Schema.TaggedError<LabStartFailed>()('LabStartFailed', {
  reason: Schema.String,
}) {}

interface Slots {
  panel: Option.Option<HTMLElement>;
  overlay: Option.Option<SVGSVGElement>;
  layers: Option.Option<HTMLElement>;
  strip: Option.Option<HTMLElement>;
}

/** Mounts the panels not yet in Solid once the shell has placed its elements. */
const Legacy = (props: { readonly slots: Slots }) => {
  const lab = useLab();
  onSettled(() => {
    const host: Option.Option<LegacyHost> = Option.all({
      panel: props.slots.panel,
      overlay: props.slots.overlay,
      layers: props.slots.layers,
      strip: props.slots.strip,
    });
    Option.map(host, (h) => mountLegacy(lab, h));
  });
  return <></>;
};

/** The lab: the shell, and each tool in its place. */
export const LabPage = (props: { readonly name: string; readonly player: Player }) => {
  const slots: Slots = {
    panel: Option.none(),
    overlay: Option.none(),
    layers: Option.none(),
    strip: Option.none(),
  };
  return (
    <Lab.Root name={props.name} player={props.player}>
      <div
        class="lab-layers"
        ref={(el: HTMLDivElement) => {
          slots.layers = Option.some(el);
        }}
      />
      <Lab.Overlay
        ref={(el) => {
          slots.overlay = Option.some(el);
        }}
      />
      <Lab.Strip>
        <div
          class="lab-legacy-strip"
          ref={(el: HTMLDivElement) => {
            slots.strip = Option.some(el);
          }}
        />
      </Lab.Strip>
      <Lab.Panel
        ref={(el) => {
          slots.panel = Option.some(el);
        }}
      >
        <Lab.Header />
      </Lab.Panel>
      <Legacy slots={slots} />
    </Lab.Root>
  );
};

const start = Effect.fn('lab.start')(
  function* (films: Films) {
    const staged = yield* Effect.tryPromise({
      try: () => stageFilm(films),
      catch: (cause) => LabStartFailed.make({ reason: String(cause) }),
    });
    const player = mountPreview(staged);
    const host = document.createElement('div');
    host.className = 'lab-root';
    document.body.append(host);
    render(() => <LabPage name={staged.name} player={player} />, host);
    yield* Effect.logInfo(`lab.mounted film=${staged.name}`);
  },
  Effect.catchTag('LabStartFailed', (e) => Effect.sync(() => showFailure(e.reason))),
);

/** Mount the lab for `films` into the page, on the film `?film=<name>` names. */
export const mountLab = (films: Films): void => {
  Effect.runFork(start(films));
};
