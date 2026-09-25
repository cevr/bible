// The lab's HTTP API, served beside the player by the app's server while
// `film lab <film>` runs. The framework owns the routes; the app mounts the
// handler at `/lab/*` (its server owns the port, the HTML bundle and HMR).
// Every route reads and writes through NotesStore, so the page and
// `film notes` see the same file.
//
//   GET  /lab/notes                     the film's notes file (its `seq` is the cursor)
//   POST /lab/notes                     a new note: NotePost (draft + the frame as base64 PNG)
//   POST /lab/notes/:id/reply           the user replies: ReplyPost
//   POST /lab/notes/:id/resolve
//   GET  /lab/notes/wait?since=&timeout= the changes past `since`, long-polled (≤ 60 s)
//   GET  /lab/stills/:name              a still PNG
//
// And the scene source the lab edits (SceneSources, SceneWriter): each write
// lands in the scene's `.ts` file, then `film check --static` runs fresh.
//
//   GET  /lab/scenes/:scene/source      the scene's file and which cues and knobs are literals
//   POST /lab/cues/:scene/:cue          set a cue's offset, dur or ease: CuePatch
//   POST /lab/knobs/:scene/:knob        set a knob: KnobPatch
//   POST /lab/undo                      put the last write's file back, byte for byte
//   GET  /lab/check                     `film check --static` now, and the write Undo reverts

import { Duration, Effect, FileSystem, Option, Path, Record as Rec, Result, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { sceneClock, sceneOf } from '../core/layout.ts';
import {
  type CheckLine,
  CheckReport,
  CuePatch,
  KnobPatch,
  LabWrite,
  Note,
  NotePost,
  NotesFile,
  NotesWait,
  ReplyPost,
  SceneSource,
  type Span,
} from '../core/schema.ts';
import { resolveTimeline } from '../core/timeline.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { readKnob, readSpans } from './scene-source.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter, type Written } from './scene-writer.ts';
import { StaticCheck } from './static-check.ts';

/** A web handler for the lab's routes, as a Bun route takes it. */
export type LabHandler = (request: Request) => Promise<Response>;

/** The longest a wait may hold a request open. */
export const MAX_WAIT = Duration.seconds(60);

const WaitQuery = Schema.Struct({
  since: Schema.FiniteFromString,
  timeout: Schema.optionalKey(Schema.FiniteFromString),
});
const IdParams = Schema.Struct({ id: Schema.String });
const SceneParams = Schema.Struct({ scene: Schema.String });
const CueParams = Schema.Struct({ scene: Schema.String, cue: Schema.String });
const KnobParams = Schema.Struct({ scene: Schema.String, knob: Schema.String });
const StillParams = Schema.Struct({ name: Schema.String });

const noteJson = HttpServerResponse.schemaJson(Note);
const notesJson = HttpServerResponse.schemaJson(NotesFile);
const waitJson = HttpServerResponse.schemaJson(NotesWait);
const writeJson = HttpServerResponse.schemaJson(LabWrite);
const sourceJson = HttpServerResponse.schemaJson(SceneSource);
const checkJson = HttpServerResponse.schemaJson(CheckReport);

/**
 * The status a failure answers with: a missing note or scene 404, a bad
 * request 400, an edit the lab will not make 422, an undo with nothing (or
 * something newer) in the way 409, the rest 500.
 */
const statusOf = (tag: string) => {
  if (tag === 'NoteNotFound' || tag === 'SceneNotLocated') return 404;
  if (tag === 'SchemaError' || tag === 'HttpServerError') return 400;
  if (tag === 'SourceRefused') return 422;
  if (tag === 'UndoUnavailable') return 409;
  return 500;
};

/** `film check --static` as the lab shows it: a check that cannot run is itself a finding. */
const findings = Effect.fn('lab.findings')(function* (film: string) {
  const check = yield* StaticCheck;
  return yield* check.run(film).pipe(
    Effect.catchTag('StaticCheckFailed', (error) => {
      const line: CheckLine = { level: 'error', tag: error._tag, message: error.message };
      return Effect.succeed([line]);
    }),
  );
});

/**
 * The cue on the scene's clock, its timeline as the file now declares it:
 * each span read back from source where it is a literal, the rest as this
 * process loaded them. None when it does not resolve.
 */
const resolveCue = Effect.fn('lab.resolveCue')(function* (
  film: string,
  scene: string,
  fresh: Readonly<Record<string, Span>>,
  cue: string,
) {
  const placed = yield* placeFilm(yield* (yield* FilmRepo).load(film));
  return Result.match(sceneOf(placed, scene), {
    onFailure: () => Option.none(),
    onSuccess: (p) =>
      Option.flatMap(
        Result.getSuccess(
          Result.try(() => resolveTimeline({ ...p.spec.timeline, ...fresh }, sceneClock(p))),
        ),
        (cues) => Option.fromUndefinedOr(cues.get(cue)),
      ),
  });
});

/** What a write answers: the file relative to the film, the value as the file now reads, the check. */
const answer = Effect.fn('lab.answer')(function* (
  film: string,
  written: Written,
  read: Effect.Effect<Partial<Pick<LabWrite, 'span' | 'resolved' | 'knob'>>, never, FilmRepo>,
) {
  const path = yield* Path.Path;
  const dir = (yield* FilmRepo).paths(film).dir;
  const found = yield* findings(film);
  return yield* writeJson({
    scene: written.scene,
    file: path.relative(dir, written.file),
    target: written.target,
    ...(yield* read),
    findings: found,
  });
});

/** Answer every failure a route can have with its status and message, logged: never a hung request. */
const handled = <E extends { readonly _tag: string; readonly message: string }, R>(
  route: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  route.pipe(
    Effect.catch((error) =>
      Effect.logWarning(`lab.request.failed tag=${error._tag} reason=${error.message}`).pipe(
        Effect.as(
          HttpServerResponse.text(`${error._tag}: ${error.message}`, {
            status: statusOf(error._tag),
          }),
        ),
      ),
    ),
  );

/** The routes over one film's notes. */
export const labRoutes = (film: string) =>
  HttpRouter.addAll([
    HttpRouter.route(
      'GET',
      '/lab/notes',
      handled(
        Effect.gen(function* () {
          return yield* notesJson(yield* (yield* NotesStore).read(film));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/notes',
      handled(
        Effect.gen(function* () {
          const { still, ...draft } = yield* HttpServerRequest.schemaBodyJson(NotePost);
          return yield* noteJson(yield* (yield* NotesStore).add(film, draft, still));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/notes/:id/reply',
      handled(
        Effect.gen(function* () {
          const { id } = yield* HttpRouter.schemaPathParams(IdParams);
          const { text } = yield* HttpServerRequest.schemaBodyJson(ReplyPost);
          const note = yield* (yield* NotesStore).reply(film, id, {
            by: 'user',
            text,
            still: Option.none(),
          });
          return yield* noteJson(note);
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/notes/:id/resolve',
      handled(
        Effect.gen(function* () {
          const { id } = yield* HttpRouter.schemaPathParams(IdParams);
          return yield* noteJson(yield* (yield* NotesStore).resolve(film, id));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/notes/wait',
      handled(
        Effect.gen(function* () {
          const query = yield* HttpServerRequest.schemaSearchParams(WaitQuery);
          const timeout = Duration.min(
            Duration.seconds(Math.max(0, query.timeout ?? 60)),
            MAX_WAIT,
          );
          return yield* waitJson(yield* (yield* NotesStore).wait(film, query.since, timeout));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/stills/:name',
      handled(
        Effect.gen(function* () {
          const { name } = yield* HttpRouter.schemaPathParams(StillParams);
          const file = yield* (yield* NotesStore).still(film, name);
          if (Option.isNone(file)) return HttpServerResponse.text('no such still', { status: 404 });
          const bytes = yield* (yield* FileSystem.FileSystem).readFile(file.value);
          return HttpServerResponse.uint8Array(bytes, { contentType: 'image/png' });
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/scenes/:scene/source',
      handled(
        Effect.gen(function* () {
          const { scene } = yield* HttpRouter.schemaPathParams(SceneParams);
          const found = yield* (yield* SceneSources).editable(film, scene);
          const dir = (yield* FilmRepo).paths(film).dir;
          return yield* sourceJson({
            scene,
            file: (yield* Path.Path).relative(dir, found.site.file),
            cues: found.cues,
            knobs: found.knobs,
          });
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/cues/:scene/:cue',
      handled(
        Effect.gen(function* () {
          const { scene, cue } = yield* HttpRouter.schemaPathParams(CueParams);
          const patch = yield* HttpServerRequest.schemaBodyJson(CuePatch);
          const written = yield* (yield* SceneWriter).setCue(film, scene, cue, patch);
          const site = yield* (yield* SceneSources).site(film, scene);
          const spans = readSpans(site.file, written.after, site.exportName);
          const read = Effect.gen(function* () {
            const span = Rec.get(spans, cue);
            const resolved = yield* resolveCue(film, scene, spans, cue);
            return {
              ...Option.match(span, { onNone: () => ({}), onSome: (s) => ({ span: s }) }),
              ...Option.match(resolved, { onNone: () => ({}), onSome: (r) => ({ resolved: r }) }),
            };
          }).pipe(Effect.orElseSucceed(() => ({})));
          return yield* answer(film, written, read);
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/knobs/:scene/:knob',
      handled(
        Effect.gen(function* () {
          const { scene, knob } = yield* HttpRouter.schemaPathParams(KnobParams);
          const { value } = yield* HttpServerRequest.schemaBodyJson(KnobPatch);
          const written = yield* (yield* SceneWriter).setKnob(film, scene, knob, value);
          const site = yield* (yield* SceneSources).site(film, scene);
          const read = Effect.succeed(
            Result.match(readKnob(site.file, written.after, site.exportName, knob), {
              onFailure: () => ({}),
              onSuccess: (v) =>
                Option.match(v, { onNone: () => ({}), onSome: (k) => ({ knob: k }) }),
            }),
          );
          return yield* answer(film, written, read);
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/undo',
      handled(
        Effect.gen(function* () {
          const written = yield* (yield* SceneWriter).undo;
          return yield* answer(film, written, Effect.succeed({}));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/check',
      handled(
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const dir = (yield* FilmRepo).paths(film).dir;
          const last = yield* (yield* SceneWriter).last;
          return yield* checkJson({
            findings: yield* findings(film),
            ...Option.match(last, {
              onNone: () => ({}),
              onSome: (w) => ({
                last: { scene: w.scene, file: path.relative(dir, w.file), target: w.target },
              }),
            }),
          });
        }),
      ),
    ),
  ]);

/**
 * The lab's routes as a web handler over the services the caller runs with
 * (the notes store, the film's source and its check), closed when the scope
 * closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (film: string) {
  const services = yield* Effect.context<
    | NotesStore
    | FileSystem.FileSystem
    | Path.Path
    | FilmRepo
    | SceneSources
    | SceneWriter
    | StaticCheck
  >();
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(labRoutes(film), { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  );
  // Each request runs with the caller's store and file system.
  const lab: LabHandler = (request) => handler(request, services);
  return lab;
});
