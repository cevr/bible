// The knobs, not yet in Solid, mounted into the editor's section: they read
// the selection and the sources through the editor's context, and write
// through its machine. They draw again whenever what they show changes.

import { Effect, Option } from 'effect';
import { createEffect, onSettled, untrack } from 'solid-js';
import { type KnobsView, mountKnobs } from '../../player/lab-knobs.ts';
import { useLab } from '../shell.tsx';
import { useEditor } from './context.tsx';
import { KnobWrite } from './grip.ts';

export const KnobsBridge = (props: { readonly overlay: () => Option.Option<SVGSVGElement> }) => {
  const { state: lab, actions: labActions, meta } = useLab();
  const { state, actions } = useEditor();
  let host = Option.none<HTMLElement>();
  let view = Option.none<KnobsView>();
  const sourceOf = (scene: string) =>
    Option.orElse(
      Option.filter(state.inspectedSource().source, (s) => s.scene === scene),
      () => Option.filter(state.stripSource().source, (s) => s.scene === scene),
    );
  onSettled(() => {
    view = untrack(() =>
      Option.map(Option.all({ overlay: props.overlay(), host }), (h) =>
        mountKnobs(meta.player, h.overlay, h.host, {
          selection: lab.selection,
          selectKnob: (scene, name) =>
            labActions.select(Option.some({ kind: 'knob', scene, name })),
          source: sourceOf,
          knobsOf: meta.stage.knobsOf,
          preview: (scene, knobs) =>
            Effect.runFork(
              meta.stage
                .preview(scene, { knobs })
                .pipe(
                  Effect.catchTag('NotPreviewed', (e) =>
                    Effect.sync(() => actions.refuse(e.message)),
                  ),
                ),
            ),
          commit: (scene, knob, value, knobs) =>
            actions.commit(KnobWrite.make({ scene, knob, value }), { knobs }),
          refuse: actions.refuse,
        }),
      ),
    );
  });
  createEffect(
    () => [lab.selection(), lab.revision(), state.inspectedSource(), state.stripSource()],
    () => {
      untrack(() => Option.map(view, (v) => v.refresh()));
    },
  );
  return (
    <div
      class="lab-knobs-host"
      ref={(el: HTMLDivElement) => {
        host = Option.some(el);
      }}
    />
  );
};
