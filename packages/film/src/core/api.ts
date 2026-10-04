// The lab's HTTP routes, declared once: every path, its params, query, body
// and answer, and every failure with its status. The server derives its
// handlers from it (`tools/lab.ts`, `tools/steps-http.ts`, `tools/studio.ts`,
// `tools/review-http.ts`, `tools/choices-http.ts`, `tools/project-http.ts`, composed in
// `tools/api-server.ts`), and the pages their clients and URLs (`lab/api.ts`
// and its siblings), so a route cannot be written two ways.
//
// One API, `LabHttpApi`, served by `film lab` for every film: what tweaks a
// film (notes, scene source, steps, studio) and what reviews it (the renders,
// choices, project). Every route is under `/api/` (`API`), where no page
// path is: a film's under `/api/films/<film>/`, the films at `/api/films`,
// and the routes of no one film (the renders' index and files, a frame, a
// length, the pages' build) under `/api/review/`. A film the app does not
// have is a 404 FilmUnknown.
//
// A failure crosses as its own class, JSON with its `_tag`, at the status
// `Refusals` gives it: the one status table. Anything a handler fails with
// that is not a Refusal answers 500 as ServerFailed, with its tag and words;
// a request whose params, query or body does not decode answers 400 as
// RequestInvalid, naming the part and why; a path under the API's own
// prefixes that no route declares answers 404 as RouteUnknown.
//
// To add an endpoint: declare it in its group below with `error: Refusals`
// (a new failure class goes into `Refusals` with its status), implement it
// in the group's `HttpApiBuilder.group` in tools, and call it on the page
// through the derived client. packages/film/README.md has the steps.

import { Codec, Field, Place, parseHref } from '@bible/url-state';
import { Array as Arr, Effect, Option, Schema, SchemaAST, SchemaTransformation } from 'effect';
import {
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/http-api';
import { PartAddress } from './address.ts';
import { isShortKey } from './shorts.ts';
import { Project, RenderVariantName } from './catalogue.ts';
import { ChoiceWrite, FilmChoices, KnobPost, PickPost, SoundCheck } from './choice.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import { ReviewDuration, ReviewFilms, ReviewFolder, ReviewIndex, ReviewVideo } from './review.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  BodyTooLarge,
  CatalogueInvalid,
  ChoiceUnknown,
  ElevenLabsFailed,
  FilmUnknown,
  FreshProcessFailed,
  HeadUnavailable,
  MediaFailed,
  NoteNotFound,
  PhoneCopyUnmade,
  RecordingInvalid,
  RecordingLossy,
  RedoUnavailable,
  ReviewFileUnknown,
  ReviewToolFailed,
  SceneNotLocated,
  SceneNotRendered,
  SourceChanged,
  SourceRefused,
  SourceShared,
  StepNotNewest,
  StillUnknown,
  SttUntimed,
  TakeMismatch,
  TakeUnknown,
  TimelineUnresolved,
  UndoUnavailable,
  VariantUnknown,
  VerbRefused,
  VersionChanged,
} from './refusals.ts';
import {
  CheckReport,
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
} from './schema.ts';
import { KeepPost, StudioAttempts, StudioBeats, StudioTake, TakePost } from './studio.ts';

// ---------------------------------------------------------------------------
// The failures only the transport has.

/**
 * A request the server does not answer at all: a Host it is not bound to or
 * told, another site's page, or a write from an Origin not its own.
 */
export class RequestRefused extends Schema.TaggedError<RequestRefused>()('RequestRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/**
 * A request whose params, query or body does not decode as its route
 * declares: which part, and the schema's words for why.
 */
export class RequestInvalid extends Schema.TaggedError<RequestInvalid>()('RequestInvalid', {
  part: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the request's ${this.part.toLowerCase()} does not decode: ${this.reason}`;
  }
}

/** A path under the API's own prefix that no route declares: an endpoint the page calls that the server does not have. */
export class RouteUnknown extends Schema.TaggedError<RouteUnknown>()('RouteUnknown', {
  path: Schema.String,
}) {
  override get message() {
    return `the lab has no route ${this.path}`;
  }
}

/** A write whose body is not JSON: a cross-site form can post text/plain without a preflight. */
export class WriteNotJson extends Schema.TaggedError<WriteNotJson>()('WriteNotJson', {
  type: Schema.String,
}) {
  override get message() {
    return `a write must send application/json, not ${this.type}`;
  }
}

/**
 * A failure no route declares, answered 500 so no request hangs: the tag it
 * failed with, for the log, and its words, which the page shows.
 */
export class ServerFailed extends Schema.TaggedError<ServerFailed>()('ServerFailed', {
  tag: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

// ---------------------------------------------------------------------------
// The one status table.

const status = HttpApiSchema.status;

/**
 * Every failure a route answers with, at its status: a thing the film or the
 * review does not have 404; a request that is not one 400; another site or
 * host 403; a write against a newer file, or a verb its variant's state
 * refuses, 409; a body over the limit 413; a body of the wrong type 415; an edit or a
 * take the lab will not make 422; a tool or a service that failed 502; the
 * rest 500.
 */
const Refusals = [
  NoteNotFound.pipe(status(404)),
  SceneNotLocated.pipe(status(404)),
  HeadUnavailable.pipe(status(404)),
  FilmUnknown.pipe(status(404)),
  ChoiceUnknown.pipe(status(404)),
  VariantUnknown.pipe(status(404)),
  TakeUnknown.pipe(status(404)),
  SceneNotRendered.pipe(status(404)),
  UnknownAct.pipe(status(404)),
  ReviewFileUnknown.pipe(status(404)),
  PhoneCopyUnmade.pipe(status(404)),
  StillUnknown.pipe(status(404)),
  AttemptUnknown.pipe(status(404)),
  UnknownScene.pipe(status(404)),
  RouteUnknown.pipe(status(404)),
  AudioInvalid.pipe(status(400)),
  RequestInvalid.pipe(status(400)),
  RequestRefused.pipe(status(403)),
  UndoUnavailable.pipe(status(409)),
  RedoUnavailable.pipe(status(409)),
  StepNotNewest.pipe(status(409)),
  SourceChanged.pipe(status(409)),
  VerbRefused.pipe(status(409)),
  VersionChanged.pipe(status(409)),
  BodyTooLarge.pipe(status(413)),
  WriteNotJson.pipe(status(415)),
  RecordingLossy.pipe(status(415)),
  SourceRefused.pipe(status(422)),
  SourceShared.pipe(status(422)),
  TimelineUnresolved.pipe(status(422)),
  TakeMismatch.pipe(status(422)),
  RecordingInvalid.pipe(status(422)),
  UnknownVoice.pipe(status(422)),
  ReviewToolFailed.pipe(status(502)),
  MediaFailed.pipe(status(502)),
  FreshProcessFailed.pipe(status(502)),
  ElevenLabsFailed.pipe(status(502)),
  SttUntimed.pipe(status(502)),
  CatalogueInvalid.pipe(status(500)),
  ServerFailed.pipe(status(500)),
] as const;

/** Any failure a route answers with. */
export const Refusal = Schema.Union(Refusals);
export type Refusal = typeof Refusal.Type;

/** Whether `u` is a failure a route answers with (else it answers ServerFailed). */
export const isRefusal = Schema.is(Refusal);

const annotatedStatus = SchemaAST.resolveAt<number>('httpApiStatus');

/** The status `refusal` answers with, as `Refusals` gives it. */
export const statusOf = (refusal: Refusal): number => {
  for (const schema of Refusals)
    if (Schema.is(schema)(refusal)) return annotatedStatus(schema.ast) ?? 500;
  return 500;
};

// ---------------------------------------------------------------------------
// The groups.

/** A write with nothing to say (a resolve) still sends JSON: the server takes no other write. */
const NoBody = Schema.Struct({});

/**
 * An Undo or a Redo as a page asks for it: with an id unique to the request,
 * which the lab records on the step once it lands (`CheckReport.landed`);
 * one sent with none (`{}`) is made all the same, and recorded without one.
 * A receipt's asks for its own change (`change`, the id its write answered):
 * stepped only while that change is the one Undo would put back (Redo would
 * make again), else refused (`StepNotNewest`) with nothing written. One with
 * none steps whatever change is newest (⌘Z, the menus).
 */
const StepRequest = Schema.Struct({
  request: Schema.optionalKey(Schema.String),
  change: Schema.optionalKey(Schema.String),
});

/** `GET /api/films/<film>/steps`: the film's history as `CheckReport` gives it, without the check. */
export const Steps = Schema.Struct({
  latest: CheckReport.fields.latest,
  undo: CheckReport.fields.undo,
  redo: CheckReport.fields.redo,
  landed: CheckReport.fields.landed,
});
export type Steps = typeof Steps.Type;

/**
 * What the owner says of a variant, a scene's render, an act or the film:
 * approve it as it is now, withdraw every approval of it, or comment on it.
 * The one say both the choices and the project take.
 */
export const Say = Schema.Union([
  Schema.TaggedStruct('Approve', {}),
  Schema.TaggedStruct('Withdraw', {}),
  Schema.TaggedStruct('Comment', { text: Schema.String.check(Schema.isNonEmpty()) }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Say = typeof Say.Type;

/** `POST /api/films/<film>/choices/say`: a say on one variant of one point, as it is now. */
export const SayPost = Schema.Struct({ point: Schema.String, variant: Schema.String, say: Say });
export type SayPost = typeof SayPost.Type;

/** `POST /api/review/sets/<folder>/<point>/say`: a say on one version of a set, as it is now. */
export const SetSayPost = Schema.Struct({ variant: Schema.String, say: Say });
export type SetSayPost = typeof SetSayPost.Type;

/** A file answered as it lies (a still, a take, a render, a mix): its type is the file's. */
const FileBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array());

const film = { film: Schema.String };

/** Where every route of the API lives: no page path starts with it. */
const API = '/api';
/** One film's routes. */
const FILM = `${API}/films/:film`;
/** The routes of no one film: the renders under the roots, and the pages' build. */
const REVIEW = `${API}/review`;

/** The notes on a film's frames: the file (its `seq` the cursor), a long-polled wait, a still. */
class NotesGroup extends HttpApiGroup.make('notes').add(
  HttpApiEndpoint.get('list', `${FILM}/notes`, {
    params: film,
    success: NotesFile,
    error: Refusals,
  }),
  HttpApiEndpoint.post('add', `${FILM}/notes`, {
    params: film,
    payload: NotePost,
    success: Note,
    error: Refusals,
  }),
  HttpApiEndpoint.post('reply', `${FILM}/notes/:id/reply`, {
    params: { ...film, id: Schema.String },
    payload: ReplyPost,
    success: Note,
    error: Refusals,
  }),
  HttpApiEndpoint.post('resolve', `${FILM}/notes/:id/resolve`, {
    params: { ...film, id: Schema.String },
    payload: NoBody,
    success: Note,
    error: Refusals,
  }),
  /** The changes past `since`, held open up to `timeout` s (at most 60). */
  HttpApiEndpoint.get('wait', `${FILM}/notes/wait`, {
    params: film,
    query: { since: Schema.Finite, timeout: Schema.optionalKey(Schema.Finite) },
    success: NotesWait,
    error: Refusals,
  }),
  HttpApiEndpoint.get('still', `${FILM}/stills/:name`, {
    params: { ...film, name: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

/** A scene's source as the lab edits it: what it may rewrite, HEAD's version, a cue or a knob written. */
class ScenesGroup extends HttpApiGroup.make('scenes').add(
  HttpApiEndpoint.get('source', `${FILM}/scenes/:scene/source`, {
    params: { ...film, scene: Schema.String },
    success: SceneSource,
    error: Refusals,
  }),
  HttpApiEndpoint.get('head', `${FILM}/scenes/:scene/head`, {
    params: { ...film, scene: Schema.String },
    success: HeadSource,
    error: Refusals,
  }),
  HttpApiEndpoint.post('cue', `${FILM}/scenes/:scene/cues/:cue`, {
    params: { ...film, scene: Schema.String, cue: Schema.String },
    payload: CuePatch,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('knob', `${FILM}/scenes/:scene/knobs/:knob`, {
    params: { ...film, scene: Schema.String, knob: Schema.String },
    payload: KnobPatch,
    success: LabWrite,
    error: Refusals,
  }),
) {}

/** The film's writes stepped back and on, and its check. */
class StepsGroup extends HttpApiGroup.make('steps').add(
  HttpApiEndpoint.post('undo', `${FILM}/undo`, {
    params: film,
    payload: StepRequest,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('redo', `${FILM}/redo`, {
    params: film,
    payload: StepRequest,
    success: LabWrite,
    error: Refusals,
  }),
  /** `film check --static` now, the latest change, and what Undo and Redo would do. */
  HttpApiEndpoint.get('check', `${FILM}/check`, {
    params: film,
    success: CheckReport,
    error: Refusals,
  }),
  /** The latest change and what Undo and Redo would do, without the check: what a page reads after a write that answered its findings. */
  HttpApiEndpoint.get('steps', `${FILM}/steps`, {
    params: film,
    success: Steps,
    error: Refusals,
  }),
) {}

/** The studio: the film's voice recorded in the browser, beat by beat. */
class StudioGroup extends HttpApiGroup.make('studio').add(
  HttpApiEndpoint.get('beats', `${FILM}/studio/beats`, {
    params: film,
    success: StudioBeats,
    error: Refusals,
  }),
  /** A recording made the beat's take; a take that says something else is a TakeMismatch naming the attempt it saved. */
  HttpApiEndpoint.post('take', `${FILM}/studio/takes/:beat`, {
    params: { ...film, beat: Schema.String },
    payload: TakePost,
    success: StudioTake,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempts', `${FILM}/studio/takes/:beat/attempts`, {
    params: { ...film, beat: Schema.String },
    success: StudioAttempts,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempt', `${FILM}/studio/takes/:beat/attempts/:file`, {
    params: { ...film, beat: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('keep', `${FILM}/studio/takes/:beat/keep`, {
    params: { ...film, beat: Schema.String },
    payload: KeepPost,
    success: StudioTake,
    error: Refusals,
  }),
) {}

/** Where the review serves a file by its ref, and its phone copy: the rest of the path is the ref. */
export const REVIEW_FILES = `${REVIEW}/files/`;
export const REVIEW_PHONE = `${REVIEW}/phone/`;

/** The review: every folder with something to review, each file where it lies, a frame, a length. */
class ReviewGroup extends HttpApiGroup.make('review').add(
  HttpApiEndpoint.get('index', `${REVIEW}/index`, {
    query: { fresh: Schema.optionalKey(Schema.String) },
    success: ReviewIndex,
    error: Refusals,
  }),
  /** The file, its byte ranges answered 206 (a phone's video seeks). */
  HttpApiEndpoint.get('file', `${REVIEW_FILES}*`, { success: FileBytes, error: Refusals }),
  /** Its 720p phone copy, once made (404 before). */
  HttpApiEndpoint.get('phone', `${REVIEW_PHONE}*`, { success: FileBytes, error: Refusals }),
  /** A JPEG of the video at `t` s (10% in without), `w` px wide. */
  HttpApiEndpoint.get('frame', `${REVIEW}/frame`, {
    query: {
      ref: Schema.String,
      t: Schema.optionalKey(Schema.Finite),
      w: Schema.optionalKey(Schema.Finite),
    },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.get('duration', `${REVIEW}/duration`, {
    query: { ref: Schema.String },
    success: ReviewDuration,
    error: Refusals,
  }),
  /**
   * A say on a version of a set in a film's project folder (its ref written
   * `%2F` for each `/`), written to that folder's `catalogue.json`: the
   * folder as the say leaves it.
   */
  HttpApiEndpoint.post('say', `${REVIEW}/sets/:folder/:point/say`, {
    params: { folder: Schema.String, point: Schema.String },
    payload: SetSayPost,
    success: ReviewFolder,
    error: Refusals,
  }),
) {}

/**
 * A film's choice points (`choice.ts`): listed, a variant picked (or
 * unpicked, or rejected), a level knob set, a variant said of (`Say`), each
 * variant heard alone or in the film's mix, and the film's sound checked
 * after a pick.
 */
class ChoicesGroup extends HttpApiGroup.make('choices').add(
  HttpApiEndpoint.get('films', `${API}/films`, { success: ReviewFilms, error: Refusals }),
  HttpApiEndpoint.get('list', `${FILM}/choices`, {
    params: film,
    success: FilmChoices,
    error: Refusals,
  }),
  /** A verb on a variant: the pick lands where the film declares it. */
  HttpApiEndpoint.post('pick', `${FILM}/choices/pick`, {
    params: film,
    payload: PickPost,
    success: ChoiceWrite,
    error: Refusals,
  }),
  /** A level point's knob written into `sound.ts`. */
  HttpApiEndpoint.post('knob', `${FILM}/choices/knob`, {
    params: film,
    payload: KnobPost,
    success: ChoiceWrite,
    error: Refusals,
  }),
  /** A variant approved, its approvals withdrawn, or commented on: the choices after it. */
  HttpApiEndpoint.post('say', `${FILM}/choices/say`, {
    params: film,
    payload: SayPost,
    success: FilmChoices,
    error: Refusals,
  }),
  /** A variant's own file: a take, an attempt. */
  HttpApiEndpoint.get('alone', `${FILM}/choices/alone`, {
    params: film,
    query: { point: Schema.String, variant: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  /** The film's whole mix with the variant in place (m4a): a score option, a take. */
  HttpApiEndpoint.get('mix', `${FILM}/choices/mix`, {
    params: film,
    query: { point: Schema.String, variant: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  /** `film check --sound` now: dead air and balance in the mix the film makes as it stands. */
  HttpApiEndpoint.get('soundCheck', `${FILM}/choices/check`, {
    params: film,
    success: SoundCheck,
    error: Refusals,
  }),
) {}

/**
 * Which render of each scene a project call is about (`main` when none),
 * decoded as the CLI reads it: a name it would refuse is a 400 here, and
 * never a token in the child's argv.
 */
const variantField = { variant: Schema.optionalKey(RenderVariantName) };

/**
 * The project as the review page shows it: the project (`catalogue.ts`), the
 * review's ref of its folder when the review's roots hold it (the page's
 * compare link), and each rendered scene's video by scene id: this
 * checkout's catalogue record of it, its share copy standing in for its
 * master.
 */
export const ProjectView = Schema.Struct({
  project: Project,
  folder: Schema.OptionFromOptionalKey(Schema.String),
  videos: Schema.Record(Schema.String, ReviewVideo),
});
export type ProjectView = typeof ProjectView.Type;

/**
 * A film's project folder by its address tree (`catalogue.ts`): each scene's
 * render, its state and the owner's say. A say on a scene is on its render
 * as stamped; an approval of an act or the film approves its current scenes,
 * and a withdrawal withdraws every approval of its scenes. Each call runs
 * `film project` in a fresh process and answers the project as it now stands.
 */
class ProjectGroup extends HttpApiGroup.make('project').add(
  HttpApiEndpoint.get('get', `${FILM}/project`, {
    params: film,
    query: variantField,
    success: ProjectView,
    error: Refusals,
  }),
  HttpApiEndpoint.post('say', `${FILM}/project/say`, {
    params: film,
    payload: Schema.Struct({ address: PartAddress, say: Say, ...variantField }),
    success: ProjectView,
    error: Refusals,
  }),
) {}

/**
 * The page's build: the number of the lab's pages as built now, past the
 * `since` a page was built at once the sources change, and the server that
 * numbered it (an id each lab process draws at its start): a page served by
 * another server is old code, whatever its number.
 */
export const PageBuild = Schema.Struct({ build: Schema.Finite, server: Schema.String });
export type PageBuild = typeof PageBuild.Type;

/**
 * The lab's own pages: a wait, held open up to `timeout` s (at most 60),
 * that answers once a file the pages were built from changed past the build
 * the page was served (`since`), so an open lab reloads onto the new code,
 * or once the track of the `film` the page plays is mixed (another film's
 * mix wakes it not); at once when the page names another `server` (the lab
 * restarted).
 */
class PageGroup extends HttpApiGroup.make('page').add(
  HttpApiEndpoint.get('wait', `${REVIEW}/build`, {
    query: {
      since: Schema.Finite,
      server: Schema.optionalKey(Schema.String),
      film: Schema.optionalKey(Schema.String),
      timeout: Schema.optionalKey(Schema.Finite),
    },
    success: PageBuild,
    error: Refusals,
  }),
) {}

/**
 * The lab's API, served by `film lab`: every film's notes, scene source,
 * steps and studio, the renders under the roots and each film's choices and
 * project, and the pages' build.
 */
export class LabHttpApi extends HttpApi.make('lab')
  .add(NotesGroup)
  .add(ScenesGroup)
  .add(StepsGroup)
  .add(StudioGroup)
  .add(ReviewGroup)
  .add(ChoicesGroup)
  .add(ProjectGroup)
  .add(PageGroup) {}

/** A route an API declares: its method and its path, `:param`s and a trailing `*` as declared. */
export interface Route {
  readonly method: string;
  readonly path: string;
}

/** Every route `api` declares, group by group. */
export const routesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<Route> => {
  const routes: Array<Route> = [];
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) =>
      void routes.push({ method: endpoint.method, path: endpoint.path }),
  });
  return routes;
};

/** A declared route's path as a matcher: a `:param` is one segment, a trailing `*` the rest. */
const matcherOf = (path: string): RegExp =>
  new RegExp(`^${path.replace(/:\w+/g, '[^/]+').replace(/\*$/, '.*')}$`);

/**
 * Whether `api` declares a route that `method pathname` reaches: what a fake
 * server checks before it answers, so a test never vouches for a path the
 * real server does not serve.
 */
export const declares = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ((method: string, pathname: string) => boolean) => {
  const routes = routesOf(api).map((route) => ({
    method: route.method,
    path: matcherOf(route.path),
  }));
  return (method, pathname) =>
    routes.some((route) => route.method === method && route.path.test(pathname));
};

/** The first segments `api`'s routes live under (`/api/`): the API's own paths. */
export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => [
  ...new Set(routesOf(api).map((route) => `/${route.path.split('/')[1] ?? ''}/`)),
];

// ---------------------------------------------------------------------------
// The pages: every place a page is at, declared once as `@bible/url-state`
// Places. The path says what a view is about (a film, its scenes, a scene in
// the lab, a set), the query how it is shown or what is selected in it (a
// cue, a note, a set's view), the hash when (`#t=`, seconds). The server
// serves a page at each place's path (`pageAt`), every link is printed by
// `Place.href` over these (`pageHref`), and each page reads and writes its
// own through `UrlState`. Old links (`/lab?film=`, `/?project=`, …) are
// rewritten to their place by `legacyPlace`, on the server as a redirect and
// on a page already loaded as a replace.

/** The app's pages, each one HTML entry: its review, its lab, its player. */
export type PageName = 'review' | 'lab' | 'player';

/** A value the URL may leave out: the empty text is none, anything else reads by `codec`. */
const maybe = <A>(codec: Schema.Codec<A, string>) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.Option(Schema.toType(codec)),
      SchemaTransformation.transformEffect<Option.Option<A>, string>({
        decode: (text) => {
          if (text === '') return Effect.succeedNone;
          return Effect.asSome(
            Effect.mapError(Schema.decodeEffect(codec)(text), (error) => error.issue),
          );
        },
        encode: (value) =>
          Option.match(value, {
            onNone: () => Effect.succeed(''),
            onSome: (a) => Effect.mapError(Schema.encodeEffect(codec)(a), (error) => error.issue),
          }),
      }),
    ),
  );

/**
 * A time on the hash (`#t=12.5`), in seconds: in a scene's lab, from the
 * scene's start (negative before it); elsewhere, from the film's or the
 * video's. None opens the page at its own start. It follows the playhead at
 * most every quarter second, and never makes a history entry.
 */
const At = Field.struct({
  t: Field.key(maybe(Codec.Finite), { default: Option.none(), throttle: '250 millis' }),
});

/** A film by its name: one path segment (a short's `/` is written `%2F`). */
const filmParams = { film: Codec.Segment };

/** A key naming something selected in a view (a cue, a note, a card): each change is a step Back walks. */
const cited = Field.key(Codec.Text, { default: '', history: 'push' });

/** A key refining how a view is shown (a pair's other side, the sound heard): no step of its own. */
const refined = Field.key(Codec.Text, { default: '' });

/** The views of a comparison set (`?view=`): side by side, a pair, the moments, the notes. */
const SET_VIEWS = ['all', 'pair', 'moments', 'notes'] as const;

/** A moment's index (`?m=`): a whole number from 0. */
const MomentIndex = Codec.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** The lab's selection keys: a cue or a knob of the path's scene, and a note. */
const LabSelection = Field.struct({ cue: cited, knob: cited, note: cited });

/**
 * A film's player on its choices and its project: the sound heard over the
 * picture (`?heard=<point>&variant=<id>` for a variant in place, `heard=own`
 * for the picture's own sound; none heard is the page's first) and the
 * picture played (`?picture=<ref>`).
 */
const FILM_PLAYER = { heard: refined, variant: refined, picture: refined };

/**
 * How a film's choices and its project are shown: only the points in one
 * state (`?only=stale`, `unapproved`, `comments`: `SHOWN_ONLY`, AA-14), every
 * point when it is empty.
 */
const FILM_SHOWN = { only: refined };

/** `?heard=` for the picture's own sound. */
export const OWN_SOUND = 'own';

/**
 * Every place a page is at. Review: home `/`, a folder of renders
 * `/sets/<folder>`, a comparison set `/sets/<folder>/<point>` (its view,
 * pair, moment and time), a film's choices (the sound heard, the picture and
 * its time) and its project (the card in focus). Player: a film's scenes
 * (the look-book) and its plain preview `/films/<film>/play#t=`. Lab: a film
 * `/films/<film>/lab#t=` (film time) or one of its scenes
 * `/films/<film>/lab/<scene>?cue=#t=` (scene time), with the selection.
 */
export const Places = {
  home: Place.make({ path: '/' }),
  folder: Place.make({ path: '/sets/:folder', params: { folder: Codec.Segment } }),
  set: Place.make({
    path: '/sets/:folder/:point',
    params: { folder: Codec.Segment, point: Codec.Segment },
    query: Field.struct({
      view: Field.key(Codec.literals(SET_VIEWS), { default: 'all', history: 'push' }),
      other: refined,
      m: Field.key(MomentIndex, { default: 0 }),
    }),
    hash: At,
  }),
  choices: Place.make({
    path: '/films/:film/choices',
    params: filmParams,
    query: Field.struct({ ...FILM_PLAYER, ...FILM_SHOWN }),
    hash: At,
  }),
  project: Place.make({
    path: '/films/:film/project',
    params: filmParams,
    query: Field.struct({ point: cited, ...FILM_PLAYER, ...FILM_SHOWN }),
    hash: At,
  }),
  scenes: Place.make({ path: '/films/:film/scenes', params: filmParams }),
  scene: Place.make({
    path: '/films/:film/scenes/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
  }),
  play: Place.make({ path: '/films/:film/play', params: filmParams, hash: At }),
  lab: Place.make({
    path: '/films/:film/lab',
    params: filmParams,
    query: Field.struct({ note: cited }),
    hash: At,
  }),
  labScene: Place.make({
    path: '/films/:film/lab/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: LabSelection,
    hash: At,
  }),
};

/** The page each place is served by, the first that holds a path winning. */
const PAGES: ReadonlyArray<readonly [Place.Place<unknown>, PageName]> = [
  [Places.home, 'review'],
  [Places.folder, 'review'],
  [Places.set, 'review'],
  [Places.choices, 'review'],
  [Places.project, 'review'],
  [Places.scenes, 'player'],
  [Places.scene, 'player'],
  [Places.play, 'player'],
  [Places.lab, 'lab'],
  [Places.labScene, 'lab'],
];

/** The page `pathname` serves, if any: a path no place declares (a chunk, a typo, an old `/lab`) serves none. */
export const pageAt = (pathname: string): Option.Option<PageName> =>
  Option.map(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, pathname))),
    ([, page]) => page,
  );

/** The places that name a film in their path. */
const FILM_PLACES: ReadonlyArray<Place.Place<{ readonly path: { readonly film: string } }>> = [
  Places.choices,
  Places.project,
  Places.scenes,
  Places.scene,
  Places.play,
  Places.lab,
  Places.labScene,
];

/** The film `href`'s path names (`/films/<film>/…`), if it names one. */
export const filmOfPage = (href: string): Option.Option<string> =>
  Option.firstSomeOf(
    FILM_PLACES.map((place) => Option.map(Place.decode(place, href), (v) => v.path.film)),
  );

/** No time on the hash: the page opens at its own start. */
const START = { t: Option.none<number>() };

/** A film player's keys and how its points are shown, at the page's defaults. */
const NOTHING_HEARD = { heard: '', variant: '', picture: '', only: '' };

/** The lab's selection keys, none set. */
const NOTHING_SELECTED = { cue: '', knob: '', note: '' };

/** What the lab has selected in a scene: a cue or a knob by name, and a note by id. */
interface LabPicked {
  readonly cue?: string;
  readonly knob?: string;
  readonly note?: string;
}

/** A time for the hash, when there is one. */
const timeOf = (t: Option.Option<number>) => ({ t });

/**
 * Every page's link, printed by its place (`Place.href`): the one printer of
 * a page path, so a link the app writes is one it reads back.
 */
export const pageHref = {
  home: (): string => Place.href(Places.home, { path: {}, query: {}, hash: {} }),
  folder: (folder: string): string =>
    Place.href(Places.folder, { path: { folder }, query: {}, hash: {} }),
  set: (folder: string, point: string): string =>
    Place.href(Places.set, {
      path: { folder, point },
      query: { view: 'all', other: '', m: 0 },
      hash: START,
    }),
  choices: (film: string): string =>
    Place.href(Places.choices, {
      path: { film },
      query: NOTHING_HEARD,
      hash: START,
    }),
  /** A film's project, with the card of `point` in focus. */
  project: (film: string, point = ''): string =>
    Place.href(Places.project, {
      path: { film },
      query: { point, ...NOTHING_HEARD },
      hash: START,
    }),
  scenes: (film: string): string =>
    Place.href(Places.scenes, { path: { film }, query: {}, hash: {} }),
  play: (film: string, t: Option.Option<number> = Option.none()): string =>
    Place.href(Places.play, { path: { film }, query: {}, hash: timeOf(t) }),
  /** The lab on `film`, at film time `t`. */
  lab: (film: string, t: Option.Option<number> = Option.none()): string =>
    Place.href(Places.lab, { path: { film }, query: { note: '' }, hash: timeOf(t) }),
  /** The lab on `scene` of `film`, at scene time `t`, with what is `picked` there. */
  labScene: (
    film: string,
    scene: string,
    picked: LabPicked = {},
    t: Option.Option<number> = Option.none(),
  ): string =>
    Place.href(Places.labScene, {
      path: { film, scene },
      query: { ...NOTHING_SELECTED, ...picked },
      hash: timeOf(t),
    }),
};

/**
 * The studio's parts, in the page bar's order: Films (the home, every
 * film's), then a film's Scenes, Lab, Choices, Project and Play. ⇧1-⇧6 go
 * to them in this order.
 */
export const PARTS = ['films', 'scenes', 'lab', 'choices', 'project', 'play'] as const;
export type Part = (typeof PARTS)[number];

/** Each part's name, as the page bar prints it. */
export const PART_TITLE: Readonly<Record<Part, string>> = {
  films: 'Films',
  scenes: 'Scenes',
  lab: 'Lab',
  choices: 'Choices',
  project: 'Project',
  play: 'Play',
};

/**
 * Whether `film` has `part`: a film has every part; a short (`<film>/shorts/<id>`)
 * is only played and seen as scenes, with no lab, choices or project of its own.
 */
export const hasPart = (film: string, part: Part): boolean =>
  !isShortKey(film) || part === 'films' || part === 'scenes' || part === 'play';

/** The page of `part` on `film`, at its defaults (Films names no film). */
export const partHref = (part: Part, film: string): string =>
  ({
    films: () => pageHref.home(),
    scenes: () => pageHref.scenes(film),
    lab: () => pageHref.lab(film),
    choices: () => pageHref.choices(film),
    project: () => pageHref.project(film),
    play: () => pageHref.play(film),
  })[part]();

/** A hash that is only a number (`#42.000`): the film time an old lab or player link carried. */
const bareTime = (hash: string): Option.Option<number> =>
  Option.filter(
    Option.liftPredicate(hash.replace(/^#/, ''), (text) => /^-?\d+(\.\d+)?$/.test(text)),
    (text) => Number.isFinite(Number(text)),
  ).pipe(Option.map(Number));

/** A non-empty value of a query key. */
const param = (query: URLSearchParams, key: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(query.get(key)), (value) => value !== '');

/** The lab's place an old `sel=<cue|knob>:<scene>:<name>` named, on `film`. */
const labOfSelection = (film: string, sel: Option.Option<string>): string =>
  Option.getOrElse(
    Option.flatMap(sel, (raw) => {
      const [kind = '', scene = '', ...rest] = raw.split(':');
      const name = rest.join(':');
      if ((kind !== 'cue' && kind !== 'knob') || scene === '' || name === '') return Option.none();
      return Option.some(pageHref.labScene(film, scene, { [kind]: name }));
    }),
    () => pageHref.lab(film),
  );

/** A comparison set's place an old `?folder=&set=&view=&other=&m=` named, its view kept. */
const setOfQuery = (folder: string, point: string, query: URLSearchParams): string => {
  const kept = new URLSearchParams();
  for (const key of ['view', 'other', 'm'])
    Option.map(param(query, key), (value) => kept.set(key, value));
  const search = `?${kept.toString()}`;
  return Option.getOrElse(
    Option.map(Place.decode(Places.set, `${pageHref.set(folder, point)}${search}`), (value) =>
      Place.href(Places.set, value),
    ),
    () => pageHref.set(folder, point),
  );
};

/** The place an old link's path and query name, if they name one. */
const legacyPath = (pathname: string, query: URLSearchParams): Option.Option<string> => {
  if (query.has('export')) return Option.none();
  const film = param(query, 'film');
  const lookbook = query.has('lookbook');
  const lab = query.has('lab');
  if (pathname === '/lab')
    return Option.some(
      Option.match(film, {
        onNone: () => pageHref.home(),
        onSome: (f) => labOfSelection(f, param(query, 'sel')),
      }),
    );
  if (pathname === '/player')
    return Option.some(
      Option.match(film, {
        onNone: () => pageHref.home(),
        onSome: (f) => {
          if (lookbook) return pageHref.scenes(f);
          if (lab) return pageHref.lab(f);
          return pageHref.play(f);
        },
      }),
    );
  if (pathname !== '/') return Option.none();
  const project = param(query, 'project');
  if (Option.isSome(project)) return Option.some(pageHref.project(project.value));
  if (Option.isSome(film)) {
    if (lookbook) return Option.some(pageHref.scenes(film.value));
    if (lab) return Option.some(pageHref.lab(film.value));
    return Option.some(pageHref.choices(film.value));
  }
  return Option.flatMap(param(query, 'folder'), (folder) =>
    Option.some(
      Option.match(param(query, 'set'), {
        onNone: () => pageHref.folder(folder),
        onSome: (point) => setOfQuery(folder, point, query),
      }),
    ),
  );
};

/** `href` with its film time on the hash as `#t=`, where its place reads film time (the player, a lab with no scene). */
const withFilmTime = (href: string, t: number): string =>
  Option.getOrElse(
    Option.orElse(
      Option.map(Place.decode(Places.play, href), (value) =>
        Place.href(Places.play, { ...value, hash: timeOf(Option.some(t)) }),
      ),
      () =>
        Option.map(Place.decode(Places.lab, href), (value) =>
          Place.href(Places.lab, { ...value, hash: timeOf(Option.some(t)) }),
        ),
    ),
    () => href,
  );

/** The card an old project anchor (`#point-<id>`) names. */
const cardAnchor = (hash: string): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(hash, (h) => h.startsWith('#point-') && h.length > '#point-'.length),
    (h) => decodeURIComponent(h.slice('#point-'.length)),
  );

/** `href`, when it is a project, with the card of `point` in focus. */
const withFocus = (href: string, point: string): Option.Option<string> =>
  Option.map(Place.decode(Places.project, href), (value) =>
    Place.href(Places.project, { ...value, query: { ...value.query, point }, hash: START }),
  );

/**
 * The place an old link names, if `href` is one: `/lab?film=<f>[&sel=…]`,
 * `/player?film=<f>[&lookbook|&lab]`, `/?project=<f>`,
 * `/?film=<f>[&lookbook|&lab]`, `/?folder=<ref>[&set=<point>…]`, a bare
 * `#<seconds>` on a place that reads film time (`/films/<f>/play`, a lab with
 * no scene), and a project card's anchor (`#point-<id>`, now `?point=<id>`). The server sends the browser on with a redirect (the browser
 * keeps the hash, which the server never sees); a page already loaded
 * replaces its entry. A renderer's export page (`&export`) is not old. A
 * scene's lab reads a bare `#<seconds>` as film time itself.
 */
export const legacyPlace = (href: string): Option.Option<string> => {
  const url = parseHref(href);
  const moved = legacyPath(url.pathname, url.searchParams);
  const at = Option.getOrElse(moved, () => `${url.pathname}${url.search}`);
  const hashKept = Option.map(moved, (to) => `${to}${url.hash}`);
  const focused = Option.flatMap(cardAnchor(url.hash), (point) => withFocus(at, point));
  return Option.orElse(focused, () =>
    Option.match(bareTime(url.hash), {
      onNone: () => hashKept,
      onSome: (t) =>
        Option.orElse(
          Option.liftPredicate(withFilmTime(at, t), (next) => next !== at),
          () => hashKept,
        ),
    }),
  );
};

// ---------------------------------------------------------------------------
// The URLs a page puts in an <img>, <audio> or <video>, derived from the routes.

/** Every route's URL, built from its declaration: the one way server, page and tests write a path. */
export const labUrls = HttpApiClient.urlBuilder(LabHttpApi);

/** A note's still. */
export const stillUrl = (film: string, name: string): string =>
  labUrls.notes.still({ params: { film, name } });

/** A studio attempt's audio, to hear it again. */
export const attemptUrl = (film: string, beat: string, file: string): string =>
  labUrls.studio.attempt({ params: { film, beat, file } });

/** A ref as a URL path: each segment encoded, the slashes kept. */
const refPath = (ref: string) =>
  ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/**
 * A ref's URL under a route that takes the rest of its path as the ref
 * (`REVIEW_FILES`, `REVIEW_PHONE`): the one way such a URL is written, since
 * the URL builder fills `:param`s and not a `*`.
 */
const refUrl = (at: typeof REVIEW_FILES | typeof REVIEW_PHONE, ref: string): string =>
  `${at}${refPath(ref)}`;

/** The review's URL for a file, by its ref. */
export const reviewFileUrl = (ref: string): string => refUrl(REVIEW_FILES, ref);

/** The review's URL for a video's 720p phone copy, by its ref. */
export const reviewPhoneUrl = (ref: string): string => refUrl(REVIEW_PHONE, ref);

/** A frame of a video, `w` px wide, at `t` s to the hundredth (10% in when none). */
export const reviewFrameUrl = (ref: string, t: Option.Option<number>, w: number): string => {
  const at = Option.match(t, { onNone: () => ({}), onSome: (s) => ({ t: Number(s.toFixed(2)) }) });
  return labUrls.review.frame({ query: { ref, w: Math.round(w), ...at } });
};

/** A variant of a choice point heard alone: a take's file, an attempt's. */
export const choiceAloneUrl = (film: string, point: string, variant: string): string =>
  labUrls.choices.alone({ params: { film }, query: { point, variant } });

/** The film's whole mix with a variant of a choice point in place (an m4a). */
export const choiceMixUrl = (film: string, point: string, variant: string): string =>
  labUrls.choices.mix({ params: { film }, query: { point, variant } });
