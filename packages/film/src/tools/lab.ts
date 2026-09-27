// The lab's HTTP API, served beside the player by the app's server while
// `film lab <film>` runs. The framework owns the routes; the app mounts the
// handler at `/lab/*` (its server owns the port, the HTML bundle and HMR).
// Every route reads and writes through NotesStore, so the page and
// `film notes` see the same file. Every route names the film it is for
// (`/lab/<film>/…`, `labBase`); one for a film the lab does not serve is a 409,
// so a page for another film can neither read nor write this one's notes or
// source.
//
//   GET  /lab/<film>/notes                           the film's notes file (its `seq` is the cursor)
//   POST /lab/<film>/notes                           a new note: NotePost (draft + the frame as base64 PNG)
//   POST /lab/<film>/notes/:id/reply                 the user replies: ReplyPost
//   POST /lab/<film>/notes/:id/resolve
//   GET  /lab/<film>/notes/wait?since=&timeout=      the changes past `since`, long-polled (≤ 60 s)
//   GET  /lab/<film>/stills/:name                    a still PNG
//
// And the scene source the lab edits (SceneSources, SceneWriter): each write
// lands in the scene's `.ts` file, then `film check --static` runs fresh.
//
//   GET  /lab/<film>/scenes/:scene/source            the scene's file and which cues and knobs are literals
//   GET  /lab/<film>/scenes/:scene/head              its timeline and knobs at HEAD, and whether its code changed
//   POST /lab/<film>/cues/:scene/:cue                set a cue's offset, dur or ease: CuePatch
//   POST /lab/<film>/knobs/:scene/:knob              set a knob: KnobPatch
//   POST /lab/<film>/undo                            put the last write's file back, byte for byte
//   GET  /lab/<film>/check                           `film check --static` now, and the write Undo reverts
//
// The API rewrites source, so it answers only the lab's own page (`admit`):
// the server listens on the loopback interface, every request must name the
// bound host:port as its Host (a rebound DNS name does not), a browser request
// must be same-origin, and a write must carry a JSON body from that origin (a
// cross-site form post can send text/plain without a preflight; JSON cannot).

import {
  Array as Arr,
  Duration,
  Effect,
  FileSystem,
  Option,
  Path,
  Record as Rec,
  Result,
  Schema,
  String as Str,
} from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { sceneClock, sceneOf } from '../core/layout.ts';
import {
  type CheckLine,
  CheckReport,
  labBase,
  CuePatch,
  HeadSource,
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
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter, type Written } from './scene-writer.ts';
import { StaticCheck } from './static-check.ts';

/** Where the server that mounts the lab listens: Bun hands each route its server. */
export interface LabBound {
  readonly hostname?: string;
  readonly port?: number;
}

/** A web handler for the lab's routes, as a Bun route takes it: the request and its server. */
export type LabHandler = (request: Request, server: LabBound) => Promise<Response>;

/** A request the lab does not answer, and the status it answers instead. */
export interface Refusal {
  readonly status: 403 | 409 | 415;
  readonly reason: string;
}

/** The names the loopback host answers to, beside the one the server was bound with. */
const LOOPBACK: ReadonlyArray<string> = ['127.0.0.1', 'localhost'];
/** `Sec-Fetch-Site` values of a request the lab's own page (or a tool, `none`) made. */
const OWN_FETCH: ReadonlyArray<string> = ['same-origin', 'none'];
const SAFE_METHODS: ReadonlyArray<string> = ['GET', 'HEAD'];

const header = (request: Request, name: string) => Option.fromNullishOr(request.headers.get(name));

const refused = (status: Refusal['status'], reason: string) =>
  Option.some<Refusal>({ status, reason });

/**
 * Whether the lab answers `request` at all: `None` when it does, else why
 * not. Pure: the Host (or, where no header is sent, the URL's host) must be
 * the bound port on a loopback name; a browser's `Sec-Fetch-Site` must be
 * same-origin; and a write must come from no Origin (a tool, like curl) or
 * the lab's own, with a JSON body.
 */
export const admit = (request: Request, bound: LabBound): Option.Option<Refusal> =>
  Option.match(Option.fromUndefinedOr(bound.port), {
    onNone: () => refused(403, 'the server has no port to check the Host against'),
    onSome: (port) => {
      const hosts = Arr.dedupe([
        ...Option.toArray(Option.fromUndefinedOr(bound.hostname)),
        ...LOOPBACK,
      ]).map((name) => `${name}:${port}`);
      const host = Option.getOrElse(header(request, 'host'), () => new URL(request.url).host);
      if (!hosts.includes(host))
        return refused(403, `Host ${host} is not the lab's (${hosts.join(', ')})`);
      const site = header(request, 'sec-fetch-site');
      if (Option.exists(site, (s) => !OWN_FETCH.includes(s)))
        return refused(403, `a ${Option.getOrElse(site, () => '')} request`);
      if (SAFE_METHODS.includes(request.method)) return Option.none();
      const origin = header(request, 'origin');
      if (Option.exists(origin, (o) => !hosts.some((h) => o === `http://${h}`)))
        return refused(403, `Origin ${Option.getOrElse(origin, () => '')} is not the lab's`);
      const type = Option.getOrElse(
        Option.map(header(request, 'content-type'), (t) =>
          Arr.headNonEmpty(Str.split(t, ';')).trim().toLowerCase(),
        ),
        () => 'no body type',
      );
      if (type !== 'application/json')
        return refused(415, `a write must send application/json, not ${type}`);
      return Option.none();
    },
  });

/**
 * Whether the request is for `film`: `None` when its path is under
 * `labBase(film)`, else a 409 naming the film the lab serves. Pure.
 */
export const forFilm = (request: Request, film: string): Option.Option<Refusal> => {
  const [, root = '', named = ''] = new URL(request.url).pathname.split('/');
  const asked = Result.getOrElse(
    Result.try(() => decodeURIComponent(named)),
    () => named,
  );
  if (root === 'lab' && asked === film) return Option.none();
  return refused(409, `this lab serves film "${film}", not "${asked}"`);
};

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
const headJson = HttpServerResponse.schemaJson(HeadSource);

/**
 * The status a failure answers with: a missing note or scene 404, a bad
 * request 400, an edit the lab will not make 422, a write or an undo with
 * something newer in the file (or nothing to undo) 409, the rest 500.
 */
const statusOf = (tag: string) => {
  if (tag === 'NoteNotFound' || tag === 'SceneNotLocated' || tag === 'HeadUnavailable') return 404;
  if (tag === 'SchemaError' || tag === 'HttpServerError') return 400;
  if (tag === 'SourceRefused' || tag === 'SourceShared') return 422;
  if (tag === 'UndoUnavailable' || tag === 'SourceChanged') return 409;
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
  read: Effect.Effect<
    Partial<Pick<LabWrite, 'span' | 'resolved' | 'unresolved' | 'knob'>>,
    never,
    FilmRepo
  >,
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
export const labRoutes = (film: string) => {
  const base = labBase(film);
  return HttpRouter.addAll([
    HttpRouter.route(
      'GET',
      `${base}/notes`,
      handled(
        Effect.gen(function* () {
          return yield* notesJson(yield* (yield* NotesStore).read(film));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/notes`,
      handled(
        Effect.gen(function* () {
          const { still, ...draft } = yield* HttpServerRequest.schemaBodyJson(NotePost);
          return yield* noteJson(yield* (yield* NotesStore).add(film, draft, still));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/notes/:id/reply`,
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
      `${base}/notes/:id/resolve`,
      handled(
        Effect.gen(function* () {
          const { id } = yield* HttpRouter.schemaPathParams(IdParams);
          return yield* noteJson(yield* (yield* NotesStore).resolve(film, id));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      `${base}/notes/wait`,
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
      `${base}/stills/:name`,
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
      `${base}/scenes/:scene/source`,
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
            refused: found.refused,
          });
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      `${base}/scenes/:scene/head`,
      handled(
        Effect.gen(function* () {
          const { scene } = yield* HttpRouter.schemaPathParams(SceneParams);
          const head = yield* (yield* SceneHead).head(film, scene);
          const dir = (yield* FilmRepo).paths(film).dir;
          return yield* headJson({
            scene,
            file: (yield* Path.Path).relative(dir, head.site.file),
            timeline: head.timeline,
            knobs: head.knobs,
            codeChanged: head.codeChanged,
            sameData: head.sameData,
          });
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/cues/:scene/:cue`,
      handled(
        Effect.gen(function* () {
          const { scene, cue } = yield* HttpRouter.schemaPathParams(CueParams);
          const patch = yield* HttpServerRequest.schemaBodyJson(CuePatch);
          const written = yield* (yield* SceneWriter).setCue(film, scene, cue, patch);
          const spans = readSpans(written.file, written.after, written.exportName);
          const span = Option.match(Rec.get(spans, cue), {
            onNone: () => ({}),
            onSome: (s) => ({ span: s }),
          });
          // The write landed; a cue that does not resolve says why in the answer, and in the log.
          const read = resolveCue(film, scene, spans, cue).pipe(
            Effect.map((resolved) => ({
              ...span,
              ...Option.match(resolved, { onNone: () => ({}), onSome: (r) => ({ resolved: r }) }),
            })),
            Effect.catch((error) =>
              Effect.logWarning(
                `lab.cue.unresolved film=${film} scene=${scene} cue=${cue} tag=${error._tag} reason=${error.message}`,
              ).pipe(Effect.as({ ...span, unresolved: `${error._tag}: ${error.message}` })),
            ),
          );
          return yield* answer(film, written, read);
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      `${base}/knobs/:scene/:knob`,
      handled(
        Effect.gen(function* () {
          const { scene, knob } = yield* HttpRouter.schemaPathParams(KnobParams);
          const { value } = yield* HttpServerRequest.schemaBodyJson(KnobPatch);
          const written = yield* (yield* SceneWriter).setKnob(film, scene, knob, value);
          const read = Effect.succeed(
            Result.match(readKnob(written.file, written.after, written.exportName, knob), {
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
      `${base}/undo`,
      handled(
        Effect.gen(function* () {
          const written = yield* (yield* SceneWriter).undo;
          return yield* answer(film, written, Effect.succeed({}));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      `${base}/check`,
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
};

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
    | SceneHead
    | StaticCheck
  >();
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(labRoutes(film), { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  );
  const run = Effect.runPromiseWith(services);
  // Each admitted request for this film runs with the caller's store and file
  // system; a refused one, logged, runs nothing.
  const lab: LabHandler = (request, server) =>
    Option.match(
      Option.orElse(admit(request, server), () => forFilm(request, film)),
      {
        onNone: () => handler(request, services),
        onSome: (refusal) =>
          run(
            Effect.logWarning(
              `lab.request.refused method=${request.method} path=${new URL(request.url).pathname} status=${refusal.status} reason="${refusal.reason}"`,
            ).pipe(
              Effect.map(() =>
                HttpServerResponse.toWeb(
                  HttpServerResponse.text(`LabRequestRefused: ${refusal.reason}`, {
                    status: refusal.status,
                  }),
                ),
              ),
            ),
          ),
      },
    );
  return lab;
});
