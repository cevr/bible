// The lab's server: one web handler for the lab's whole API (`LabHttpApi` in
// `core/api.ts`, where every path, body and answer is declared), for every
// film the app has, and its pages (`LabPage`). It tweaks a film (notes on
// frames, the scene source the cues and knobs write back to, Undo and Redo,
// the studio) and reviews it (the renders under the roots, the film's
// choices and its project), and runs for days: `film lab`, the box's unit.
//
// The notes read and write through NotesStore, so the page and `film notes`
// see the same file. The scene source routes write through SceneWriter: each
// write lands in the scene's `.ts` file, then `film check --static` runs
// fresh; Undo and Redo put the newest write back or make it again.
//
// The API rewrites source and is reached from a phone, so every request, the
// pages included, passes the one gate (`api-server.ts`): the bound port's
// loopback names and the hosts it is told (`FILM_LAB_HOSTS`), nothing else.

import {
  Config,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  type Path,
  Record as Rec,
  Result,
} from 'effect';
import type { HttpPlatform } from 'effect/http';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { StillUnknown } from '../core/refusals.ts';
import { type Allowed, answered, serveApi, withServices } from './api-server.ts';
import { choicesGroup } from './choices-http.ts';
import type { Choices } from './choices.ts';
import { LabPage } from './lab-page.ts';
import { projectGroup } from './project-http.ts';
import { reviewGroup } from './review-http.ts';
import type { Review } from './review.ts';
import type { ContentStore } from './content-store.ts';
import { type FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { readKnob, readSpans } from './scene-source.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { type CueWritten, SceneWriter } from './scene-writer.ts';
import type { SourceWriter } from './source-writer.ts';
import type { FreshFilm } from './fresh-film.ts';
import { stepsGroup, writeAnswer } from './steps-http.ts';
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

/** The notes on the film's frames. */
const notesGroup = HttpApiBuilder.group(LabHttpApi, 'notes', (handlers) =>
  handlers
    .handle('list', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).read(film);
        }),
      ),
    )
    .handle('add', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const { still, ...draft } = payload;
          return yield* (yield* NotesStore).add(film, draft, still);
        }),
      ),
    )
    .handle('reply', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
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
          const film = yield* filmNamed(params.film);
          return yield* (yield* NotesStore).resolve(film, params.id);
        }),
      ),
    )
    .handle('wait', ({ params, query }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
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
          const film = yield* filmNamed(params.film);
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
          const film = yield* filmNamed(params.film);
          const found = yield* (yield* SceneSources).editable(film, params.scene);
          return {
            scene: params.scene,
            file: found.site.shown,
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
          const film = yield* filmNamed(params.film);
          const head = yield* (yield* SceneHead).head(film, params.scene);
          return {
            scene: params.scene,
            file: head.site.shown,
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
          const film = yield* filmNamed(params.film);
          const { scene, cue } = params;
          const written = yield* (yield* SceneWriter).setCue(film, scene, cue, payload);
          return yield* cueWritten(film, cue, written);
        }),
      ),
    )
    .handle('knob', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
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

/** The pages' build: a wait that answers once a source a build read changes. */
const pageGroup = HttpApiBuilder.group(LabHttpApi, 'page', (handlers) =>
  handlers.handle('wait', ({ query }) =>
    answered(
      Effect.flatMap(LabPage, (page) =>
        page.wait(query.since, Duration.seconds(Math.max(0, query.timeout ?? 60))),
      ),
    ),
  ),
);

/**
 * The hosts the lab answers to beside loopback: `FILM_LAB_HOSTS`,
 * comma-separated Host values (`bite-cristian.exe.xyz:8229`); a page served
 * through one may write from `http://` or `https://` it.
 */
export const labAllowed = Config.String('FILM_LAB_HOSTS').pipe(
  Config.withDefault(''),
  Config.map((text): Allowed => ({
    hosts: text
      .split(',')
      .map((host) => host.trim())
      .filter((host) => host.length > 0),
  })),
);

/**
 * What the lab's handlers run with: the notes store, the film's folder, its
 * source (read, written, stepped), its takes, the renders' index, the
 * choices, the pages, and `FreshFilm` for every read of a film's modules.
 * The lab runs for days and keeps a module as it first imported it, so
 * nothing here loads a film (`FilmRepo`), the sound library
 * (`SoundLibrary`) or mixes in process (`Mixer`): the studio reads the
 * script and voice fresh (`StudioReadings`) and remixes fresh, a cue write is
 * judged and resolved fresh (SceneWriter's check), a scene's drawing is
 * located fresh (`SceneSources`), and a film's options are
 * read and heard fresh (`Choices`). `lab-context.types.ts` fails the
 * typecheck if a loader joins.
 */
export type LabContext =
  | NotesStore
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | ContentStore
  | FilmFolder
  | SceneSources
  | SceneWriter
  | SourceWriter
  | SceneHead
  | FreshFilm
  | Takes
  | StudioReadings
  | Review
  | Choices
  | LabPage;

/**
 * The lab's whole server as one web handler over the services the caller
 * runs with (`LabContext`): every request passes the gate with `allowed`
 * first, the pages included, so a foreign Host reads nothing; then the API's
 * routes answer theirs, for any film the app has, and the pages the rest.
 * Closed when the scope closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (allowed: Allowed) {
  const services = yield* Effect.context<LabContext>();
  const routes = HttpApiBuilder.layer(LabHttpApi).pipe(
    Layer.provide(
      Layer.mergeAll(
        notesGroup,
        scenesGroup,
        stepsGroup,
        studioGroup,
        reviewGroup,
        choicesGroup,
        projectGroup,
        pageGroup,
      ),
    ),
    withServices(services),
  );
  const page = (yield* LabPage).answer;
  return yield* serveApi(LabHttpApi, routes, { allowed, page });
});
