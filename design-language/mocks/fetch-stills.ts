// The mocks' stills: frames of a film fetched from a running lab, written to
// `stills/` beside the mocks (gitignored, as the film's media is). Every read
// goes through the lab's declared API (`LabHttpApi`), so the lab's gate
// answers it as it answers a page: the film's project gives its scenes, their
// spans and each rendered scene's video (`ProjectView.videos`, scoped to the
// film, so two films with a scene of one name never trade pictures), and the
// review's `frame` route gives each frame. It writes what the mocks show: a
// tape still every 5 s of film time (`tape-000.jpg`, `tape-005.jpg`, …), one
// poster a scene (`poster-<scene>.jpg`), and the Lab's large frame
// (`big-cold.jpg`, cold at 9.5 s). A scene with no render is named and skipped.
//
//   LAB=http://127.0.0.1:8270 bun design-language/mocks/fetch-stills.ts
//
// `LAB` is the lab's address (required); `FILM` the film (default
// righteousness-by-faith); `OUT` the folder written (default `stills/` here).

import { Array as Arr, Cause, Config, Console, Effect, Option, Record } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

import { LabHttpApi, type ProjectView } from '../../packages/film/src/core/api.ts';

/** Seconds of film time between two tape stills, as §6's tape lays them. */
const STEP = 5;
/** The large frames the Lab mocks draw: scene, seconds into it, file. */
const BIG = [['cold', 9.5, 'big-cold.jpg']] as const;

/** A scene's video in its own film's project: the ref of its render, none when it has none. */
export const sceneVideo = (view: ProjectView, scene: string): Option.Option<string> =>
  Option.map(Record.get(view.videos, scene), (video) => video.ref);

const fetchStills = Effect.gen(function* () {
  const lab = yield* Config.String('LAB');
  const film = yield* Config.String('FILM').pipe(Config.withDefault('righteousness-by-faith'));
  const out = yield* Config.String('OUT').pipe(Config.withDefault(`${import.meta.dir}/stills`));
  const client = yield* HttpApiClient.make(LabHttpApi, { baseUrl: lab });
  const view = yield* client.project.get({ params: { film }, query: {} });
  // A frame's bytes written under `out`; a scene with no render is named and skipped.
  const frame = (scene: string, t: number, w: number, file: string) =>
    Option.match(sceneVideo(view, scene), {
      onNone: () => Console.log(`miss ${file}: no render of ${scene}`),
      onSome: (ref) =>
        client.review.frame({ query: { ref, t, w } }).pipe(
          // oxlint-disable-next-line effect/noGlobals -- the script's one host write, at its edge
          Effect.flatMap((bytes) => Effect.promise(() => Bun.write(`${out}/${file}`, bytes))),
        ),
    });
  // The scenes the film's cut places, each with its span of film time.
  const scenes = Arr.getSomes(
    view.project.scenes.map(({ scene, span }) => Option.map(span, (at) => ({ scene, span: at }))),
  );
  const end = Math.max(0, ...scenes.map((s) => s.span.start + s.span.dur));
  yield* Effect.forEach(
    Arr.makeBy(Math.ceil(end / STEP), (i) => i * STEP),
    (t) =>
      Option.match(
        Arr.findLast(scenes, (s) => s.span.start <= t + 0.001),
        {
          onNone: () => Effect.void,
          // A little into the step, never past the scene's last frame.
          onSome: (at) =>
            frame(
              at.scene,
              Math.min(Math.max(0.05, t - at.span.start + 0.2), at.span.dur - 0.1),
              240,
              `tape-${String(t).padStart(3, '0')}.jpg`,
            ),
        },
      ),
  );
  yield* Effect.forEach(scenes, (s) =>
    frame(s.scene, Math.min(s.span.dur * 0.45, s.span.dur - 0.1), 480, `poster-${s.scene}.jpg`),
  );
  yield* Effect.forEach(BIG, ([scene, t, file]) => frame(scene, t, 1280, file));
  yield* Console.log(`${film}: ${scenes.length} scenes over ${end.toFixed(1)} s into ${out}`);
});

/** The fetch as one run: a failure (no `LAB`, a lab not answering) is printed, not swallowed. */
export const run = () =>
  Effect.runPromise(
    fetchStills.pipe(
      Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
      Effect.provide(FetchHttpClient.layer),
    ),
  );

if (import.meta.main) void run();
