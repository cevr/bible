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

import { Duration, Effect, FileSystem, Option, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { Note, NotePost, NotesFile, NotesWait, ReplyPost } from '../core/schema.ts';
import { NotesStore } from './notes-store.ts';

/** A web handler for the lab's routes, as a Bun route takes it. */
export type LabHandler = (request: Request) => Promise<Response>;

/** The longest a wait may hold a request open. */
export const MAX_WAIT = Duration.seconds(60);

const WaitQuery = Schema.Struct({
  since: Schema.FiniteFromString,
  timeout: Schema.optionalKey(Schema.FiniteFromString),
});
const IdParams = Schema.Struct({ id: Schema.String });
const StillParams = Schema.Struct({ name: Schema.String });

const noteJson = HttpServerResponse.schemaJson(Note);
const notesJson = HttpServerResponse.schemaJson(NotesFile);
const waitJson = HttpServerResponse.schemaJson(NotesWait);

/** The status a failure answers with: a missing note 404, a bad request 400, the rest 500. */
const statusOf = (tag: string) => {
  if (tag === 'NoteNotFound') return 404;
  if (tag === 'SchemaError' || tag === 'HttpServerError') return 400;
  return 500;
};

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
  ]);

/**
 * The lab's routes as a web handler over the notes store and file system the
 * caller runs with, closed when the scope closes.
 */
export const labHandler = Effect.fn('film.lab.handler')(function* (film: string) {
  const services = yield* Effect.context<NotesStore | FileSystem.FileSystem>();
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(labRoutes(film), { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  );
  // Each request runs with the caller's store and file system.
  const lab: LabHandler = (request) => handler(request, services);
  return lab;
});
