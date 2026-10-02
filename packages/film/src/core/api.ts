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

import { Option, Schema, SchemaAST } from 'effect';
import {
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/http-api';
import { PartAddress } from './address.ts';
import { Project, RenderVariantName } from './catalogue.ts';
import { ChoiceWrite, FilmChoices, KnobPost, PickPost, SoundCheck } from './choice.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import { ReviewDuration, ReviewFilms, ReviewIndex, ReviewVideo } from './review.ts';
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
  StillUnknown,
  SttUntimed,
  TakeMismatch,
  TakeUnknown,
  TimelineUnresolved,
  UndoUnavailable,
  VariantUnknown,
  VerbRefused,
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
  SourceChanged.pipe(status(409)),
  VerbRefused.pipe(status(409)),
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

/** A write with nothing to say (undo, redo, resolve) still sends JSON: the server takes no other write. */
const NoBody = Schema.Struct({});

/** `GET /api/films/<film>/steps`: the film's history as `CheckReport` gives it, without the check. */
export const Steps = Schema.Struct({
  latest: CheckReport.fields.latest,
  undo: CheckReport.fields.undo,
  redo: CheckReport.fields.redo,
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
    payload: NoBody,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('redo', `${FILM}/redo`, {
    params: film,
    payload: NoBody,
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
 * `since` a page was built at once the sources change.
 */
export const PageBuild = Schema.Struct({ build: Schema.Finite });
export type PageBuild = typeof PageBuild.Type;

/**
 * The lab's own pages: a wait, held open up to `timeout` s (at most 60),
 * that answers once a file under the sources the pages are built from
 * changed past the build the page was served (`since`), so an open lab
 * reloads onto the new code.
 */
class PageGroup extends HttpApiGroup.make('page').add(
  HttpApiEndpoint.get('wait', `${REVIEW}/build`, {
    query: { since: Schema.Finite, timeout: Schema.optionalKey(Schema.Finite) },
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

/** The first segments `api`'s routes live under (`/api/`): the API's own paths. */
export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => [
  ...new Set(routesOf(api).map((route) => `/${route.path.split('/')[1] ?? ''}/`)),
];

// ---------------------------------------------------------------------------
// The pages: which of the app's pages each path outside the API serves.

/** The app's pages, each one HTML entry: its review, its lab, its player. */
export type PageName = 'review' | 'lab' | 'player';

/**
 * Every path a page is served at, the first match winning: a `:name` is one
 * segment, a trailing `*` one segment or more. A film's places (PA-1) and,
 * after them, the paths before them (`/lab?film=`, `/player?film=`, `/?film=`),
 * which keep opening the links already handed out. A film's scenes open the
 * player, whose look-book is the film's scenes today.
 */
const PAGE_PATHS: ReadonlyArray<readonly [string, PageName]> = [
  ['/', 'review'],
  ['/sets/*', 'review'],
  ['/films/:film/scenes', 'player'],
  ['/films/:film/scenes/*', 'player'],
  ['/films/:film/choices', 'review'],
  ['/films/:film/project', 'review'],
  ['/films/:film/lab', 'lab'],
  ['/films/:film/lab/*', 'lab'],
  ['/films/:film/play', 'player'],
  ['/lab', 'lab'],
  ['/player', 'player'],
];

/** Whether `pathname`'s segments are those `pattern` declares. */
const matchesPath = (pattern: string, pathname: string): boolean => {
  if (pattern === '/' || pathname === '/') return pattern === pathname;
  const want = pattern.split('/').slice(1);
  const have = pathname.split('/').slice(1);
  if (have.includes('')) return false;
  const same = (segment: string, i: number) => segment.startsWith(':') || segment === have[i];
  if (want.at(-1) === '*') return have.length >= want.length && want.slice(0, -1).every(same);
  return have.length === want.length && want.every(same);
};

/** The page `pathname` serves, if any: a path no page declares (a chunk, a typo) serves none. */
export const pageAt = (pathname: string): Option.Option<PageName> =>
  Option.map(
    Option.fromUndefinedOr(PAGE_PATHS.find(([pattern]) => matchesPath(pattern, pathname))),
    ([, page]) => page,
  );

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
