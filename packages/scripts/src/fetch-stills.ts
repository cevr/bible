// The design language mocks' stills: frames of a film fetched from a running
// lab, written to `design-language/mocks/stills/` (gitignored, as the film's
// media is). Every read goes through the lab's declared API (`LabHttpApi`), so
// the lab's gate answers it as it answers a page: the film's project gives its
// scenes, their spans and each rendered scene's video (`ProjectView.videos`,
// scoped to the film, so two films with a scene of one name never trade
// pictures), and the review's `frame` route gives each frame. It writes what
// the mocks show: a tape still every 5 s of film time (`tape-000.jpg`,
// `tape-005.jpg`, …), one poster a scene (`poster-<scene>.jpg`), and the Lab's
// large frame (`big-cold.jpg`, cold at 9.5 s). A scene with no render is named
// and skipped. The folder then holds exactly this run's stills: every still of
// those three kinds the run did not write (a skipped scene's, another film's,
// a render since gone) is removed, so a mock shows a missing still as missing,
// never an old one as current.
//
//   bun run --cwd packages/scripts fetch:stills --lab http://127.0.0.1:8270
//
// `--lab` is the lab's address (required); `--film` the film (default
// righteousness-by-faith); `--out` the folder written (default the mocks'
// stills folder, from the repo root).

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { LabHttpApi, type ProjectView } from '@bible/film/api';
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Record } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import { HttpApiClient } from 'effect/http-api';

/** The repo root, not the caller's cwd: this file is two levels below the package root, four below the repo's. */
const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/\/$/u, '');

/** Seconds of film time between two tape stills, as the design language's tape lays them. */
const STEP = 5;
/** The large frames the Lab mocks draw: scene, seconds into it, file. */
const BIG = [['cold', 9.5, 'big-cold.jpg']] as const;

/** A scene's video in its own film's project: the ref of its render, none when it has none. */
const sceneVideo = (view: ProjectView, scene: string): Option.Option<string> =>
  Option.map(Record.get(view.videos, scene), (video) => video.ref);

/** A file this script writes: a tape still, a poster or a large frame. */
const isStill = (file: string) => /^(?:tape|poster|big)-[\w-]+\.jpg$/.test(file);

/** What one fetch reads and writes: the lab's address, the film, the folder written. */
interface StillsArgs {
  readonly lab: string;
  readonly film: string;
  readonly out: string;
}

const fetchStills = Effect.fn('scripts.fetchStills')(function* ({ lab, film, out }: StillsArgs) {
  const client = yield* HttpApiClient.make(LabHttpApi, { baseUrl: lab });
  const fs = yield* FileSystem.FileSystem;
  const view = yield* client.project.get({ params: { film }, query: {} });
  yield* fs.makeDirectory(out, { recursive: true });
  // A frame's bytes written under `out`, and its name; a scene with no render is named and skipped.
  const frame = (scene: string, t: number, w: number, file: string) =>
    Option.match(sceneVideo(view, scene), {
      onNone: () => Console.log(`miss ${file}: no render of ${scene}`).pipe(Effect.as([])),
      onSome: (ref) =>
        client.review.frame({ query: { ref, t, w } }).pipe(
          Effect.flatMap((bytes) => fs.writeFile(`${out}/${file}`, bytes)),
          Effect.as([file]),
        ),
    });
  // The scenes the film's cut places, each with its span of film time.
  const scenes = Arr.getSomes(
    view.project.scenes.map(({ scene, span }) => Option.map(span, (at) => ({ scene, span: at }))),
  );
  const end = Math.max(0, ...scenes.map((s) => s.span.start + s.span.dur));
  const tape = yield* Effect.forEach(
    Arr.makeBy(Math.ceil(end / STEP), (i) => i * STEP),
    (t) =>
      Option.match(
        Arr.findLast(scenes, (s) => s.span.start <= t + 0.001),
        {
          onNone: () => Effect.succeed([]),
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
  const posters = yield* Effect.forEach(scenes, (s) =>
    frame(s.scene, Math.min(s.span.dur * 0.45, s.span.dur - 0.1), 480, `poster-${s.scene}.jpg`),
  );
  const big = yield* Effect.forEach(BIG, ([scene, t, file]) => frame(scene, t, 1280, file));
  // The folder is this run's stills: any other still is a skipped scene's, another film's or a gone render's.
  const written = new Set([tape, posters, big].flat(2));
  const stale = (yield* fs.readDirectory(out)).filter(
    (file) => isStill(file) && !written.has(file),
  );
  yield* Effect.forEach(stale, (file) => fs.remove(`${out}/${file}`));
  yield* Console.log(
    `${film}: ${scenes.length} scenes over ${end.toFixed(1)} s, ${written.size} stills into ${out}, ${stale.length} stale removed`,
  );
});

/** The platform one fetch runs on: the fetch API for the lab, Bun for the files. */
const platform = Layer.mergeAll(FetchHttpClient.layer, BunServices.layer);

const command = Command.make(
  'fetch-stills',
  {
    lab: Flag.String('lab').pipe(
      Flag.withDescription('The running lab, e.g. http://127.0.0.1:8270'),
    ),
    film: Flag.String('film').pipe(
      Flag.withDefault('righteousness-by-faith'),
      Flag.withDescription('The film whose stills the mocks show'),
    ),
    out: Flag.String('out').pipe(
      Flag.withDefault(`${repoRoot}/design-language/mocks/stills`),
      Flag.withDescription('The folder written; it ends holding only this run’s stills'),
    ),
  },
  fetchStills,
).pipe(Command.withDescription("Fetch the design language mocks' stills from a running lab"));

if (import.meta.main)
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(platform), BunRuntime.runMain);
