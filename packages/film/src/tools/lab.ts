// The lab's routes, served beside the player by the app's server while
// `film lab <film>` runs: the handlers of the lab's API (`LabHttpApi` in
// `core/api.ts`, where every path, body and answer is declared). The app
// mounts the handler at `/lab/*` (its server owns the port, the HTML bundle
// and HMR). Every route names the film it is for (`/lab/<film>/…`); the lab
// answers only its own (`FilmScope.only`), so a page for another film can
// neither read nor write this one's notes or source.
//
// The notes read and write through NotesStore, so the page and `film notes`
// see the same file. The scene source routes write through SceneWriter: each
// write lands in the scene's `.ts` file, then `film check --static` runs
// fresh; Undo and Redo put the newest write back or make it again.
//
// The API rewrites source, so it answers only the lab's own page: the server
// listens on the loopback interface, and every request passes the gate
// (`api-server.ts`) with loopback only.

import {
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Result,
  Schema,
} from 'effect';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { StillUnknown } from '../core/refusals.ts';
import { FilmScope, LOOPBACK_ONLY, answered, named, serveApi, withServices } from './api-server.ts';
import type { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { readKnob, readSpans } from './scene-source.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { type CueWritten, SceneWriter } from './scene-writer.ts';
import type { SourceWriter } from './source-writer.ts';
import type { FreshFilm } from './fresh-film.ts';
import { stepHandlers, writeAnswer } from './steps-http.ts';
import { type StudioReadings, studioGroup } from './studio.ts';
import type { Takes } from './takes.ts';

/** The longest a wait may hold a request open. */
const MAX_WAIT = Duration.seconds(60);

/** A cue written: the span as the file now reads it, and where it resolves (or why it does not). */
const cueWritten = Effect.fn('lab.cueWritten')(function* (
  film: FilmName,
  cue: string,
  done: CueWritten,
) {
  const { written, read } = done;
  const spans = readSpans(written.file, written.after, written.exportName);
  const span = Option.match(Rec.get(spans, cue), {
    onNone: () => ({}),
    onSome: (s) => ({ span: s }),
  });
  // Where the cue lands is the write's own check: run fresh, on the text the write made.
  const { _tag, ...where } = read;
  return yield* writeAnswer(film, written, Effect.succeed({ ...span, ...where }));
});

/** The film's writes stepped back and on, and its check (the review serves the same three). */
const stepsGroup = HttpApiBuilder.group(LabHttpApi, 'steps', (handlers) =>
  handlers
    .handle('undo', stepHandlers.undo)
    .handle('redo', stepHandlers.redo)
    .handle('check', stepHandlers.check)
    .handle('steps', stepHandlers.steps),
);

/** The notes on the film's frames. */
const notesGroup = HttpApiBuilder.group(LabHttpApi, 'notes', (handlers) =>
  handlers
    .handle('list', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* (yield* NotesStore).read(film);
        }),
      ),
    )
    .handle('add', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const { still, ...draft } = payload;
          return yield* (yield* NotesStore).add(film, draft, still);
        }),
      ),
    )
    .handle('reply', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* (yield* NotesStore).reply(film, params.id, {
            by: 'user',
            text: payload.text,
            still: Option.none(),
          });
        }),
      ),
    )
    .handle('resolve', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* (yield* NotesStore).resolve(film, params.id);
        }),
      ),
    )
    .handle('wait', ({ params, query }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const timeout = Duration.min(
            Duration.seconds(Math.max(0, query.timeout ?? 60)),
            MAX_WAIT,
          );
          return yield* (yield* NotesStore).wait(film, query.since, timeout);
        }),
      ),
    )
    .handle('still', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* NotesStore).still(film, params.name);
          if (Option.isNone(file)) return yield* StillUnknown.make({ film, name: params.name });
          const bytes = yield* (yield* FileSystem.FileSystem).readFile(file.value);
          return HttpServerResponse.uint8Array(bytes, { contentType: 'image/png' });
        }),
      ),
    ),
);

/** The scene source the lab edits. */
const scenesGroup = HttpApiBuilder.group(LabHttpApi, 'scenes', (handlers) =>
  handlers
    .handle('source', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const found = yield* (yield* SceneSources).editable(film, params.scene);
          const dir = (yield* FilmFolder).paths(film).dir;
          return {
            scene: params.scene,
            file: (yield* Path.Path).relative(dir, found.site.file),
            cues: found.cues,
            knobs: found.knobs,
            refused: found.refused,
          };
        }),
      ),
    )
    .handle('head', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const head = yield* (yield* SceneHead).head(film, params.scene);
          const dir = (yield* FilmFolder).paths(film).dir;
          return {
            scene: params.scene,
            file: (yield* Path.Path).relative(dir, head.site.file),
            timeline: head.timeline,
            knobs: head.knobs,
            codeChanged: head.codeChanged,
            sameData: head.sameData,
          };
        }),
      ),
    )
    .handle('cue', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const { scene, cue } = params;
          const written = yield* (yield* SceneWriter).setCue(film, scene, cue, payload);
          return yield* cueWritten(film, cue, written);
        }),
      ),
    )
    .handle('knob', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const { scene, knob } = params;
          const written = yield* (yield* SceneWriter).setKnob(film, scene, knob, payload.value);
          const read = Effect.succeed(
            Result.match(readKnob(written.file, written.after, written.exportName, knob), {
              onFailure: () => ({}),
              onSuccess: (v) =>
                Option.match(v, { onNone: () => ({}), onSome: (k) => ({ knob: k }) }),
            }),
          );
          return yield* writeAnswer(film, written, read);
        }),
      ),
    ),
);

const asFilmName = Schema.decodeSync(FilmName);

/**
 * What the lab's handlers run with: the notes store, the film's folder,
 * its source (read, written, stepped), its takes, and `FreshFilm` for every
 * read of the film's modules. The lab runs for hours and keeps a module as it
 * first imported it, so nothing here loads the film (`FilmRepo`) or mixes it
 * in process (`Mixer`): the studio reads the script and voice fresh
 * (`StudioReadings`) and remixes fresh, and a cue write is judged and
 * resolved fresh (SceneWriter's check).
 * `review-context.types.ts` fails the typecheck if a loader joins.
 */
export type LabContext =
  | NotesStore
  | FileSystem.FileSystem
  | Path.Path
  | ContentStore
  | FilmFolder
  | SceneSources
  | SceneWriter
  | SourceWriter
  | SceneHead
  | FreshFilm
  | Takes
  | StudioReadings;

/**
 * The lab's whole API for `film` as one web handler over the services the
 * caller runs with (`LabContext`), closed when the scope closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (film: string) {
  const services = yield* Effect.context<LabContext>();
  const routes = HttpApiBuilder.layer(LabHttpApi).pipe(
    Layer.provide(Layer.mergeAll(notesGroup, scenesGroup, stepsGroup, studioGroup)),
    withServices(services, FilmScope.only(asFilmName(film))),
  );
  return yield* serveApi(LabHttpApi, routes, { allowed: LOOPBACK_ONLY });
});
