// The lab's and the review's HTTP routes, declared once: every path, its
// params, query, body and answer, and every failure with its status. The
// servers derive their handlers from it (`tools/lab.ts`, `tools/studio.ts`,
// `tools/review-http.ts`, `tools/choices-http.ts`, `tools/project-http.ts`,
// composed in `tools/api-server.ts`), and the pages their clients and URLs
// (`lab/api.ts` and its siblings), so a route cannot be written two ways.
//
// Two APIs share the groups: the lab (`film lab <film>`: notes, scene source,
// steps, studio) and the review (`film review`: review, choices, project,
// steps). Every film route is under `/lab/<film>/`, but the project's, under
// `/review/project/<film>`; a film the server does not serve is a 404
// FilmUnknown.
//
// A failure crosses as its own class, JSON with its `_tag`, at the status
// `Refusals` gives it: the one status table. Anything a handler fails with
// that is not a Refusal answers 500 as ServerFailed, with its tag and words.
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
import { Address } from './address.ts';
import { Project } from './catalogue.ts';
import {
  ApprovePost,
  CommentPost,
  ChoiceWrite,
  FilmChoices,
  KnobPost,
  PickPost,
  SoundCheck,
} from './choice.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import { ReviewDuration, ReviewFilms, ReviewIndex } from './review.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  BodyTooLarge,
  CatalogueInvalid,
  ChoiceUnknown,
  ElevenLabsFailed,
  FilmNotFound,
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
export const Refusals = [
  NoteNotFound.pipe(status(404)),
  SceneNotLocated.pipe(status(404)),
  HeadUnavailable.pipe(status(404)),
  FilmNotFound.pipe(status(404)),
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
  AudioInvalid.pipe(status(400)),
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
export const NoBody = Schema.Struct({});

/** A file answered as it lies (a still, a take, a render, a mix): its type is the file's. */
const FileBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array());

const film = { film: Schema.String };

/** The notes on a film's frames: the file (its `seq` the cursor), a long-polled wait, a still. */
export class NotesGroup extends HttpApiGroup.make('notes').add(
  HttpApiEndpoint.get('list', '/lab/:film/notes', {
    params: film,
    success: NotesFile,
    error: Refusals,
  }),
  HttpApiEndpoint.post('add', '/lab/:film/notes', {
    params: film,
    payload: NotePost,
    success: Note,
    error: Refusals,
  }),
  HttpApiEndpoint.post('reply', '/lab/:film/notes/:id/reply', {
    params: { ...film, id: Schema.String },
    payload: ReplyPost,
    success: Note,
    error: Refusals,
  }),
  HttpApiEndpoint.post('resolve', '/lab/:film/notes/:id/resolve', {
    params: { ...film, id: Schema.String },
    payload: NoBody,
    success: Note,
    error: Refusals,
  }),
  /** The changes past `since`, held open up to `timeout` s (at most 60). */
  HttpApiEndpoint.get('wait', '/lab/:film/notes/wait', {
    params: film,
    query: { since: Schema.Finite, timeout: Schema.optionalKey(Schema.Finite) },
    success: NotesWait,
    error: Refusals,
  }),
  HttpApiEndpoint.get('still', '/lab/:film/stills/:name', {
    params: { ...film, name: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

/** A scene's source as the lab edits it: what it may rewrite, HEAD's version, a cue or a knob written. */
export class ScenesGroup extends HttpApiGroup.make('scenes').add(
  HttpApiEndpoint.get('source', '/lab/:film/scenes/:scene/source', {
    params: { ...film, scene: Schema.String },
    success: SceneSource,
    error: Refusals,
  }),
  HttpApiEndpoint.get('head', '/lab/:film/scenes/:scene/head', {
    params: { ...film, scene: Schema.String },
    success: HeadSource,
    error: Refusals,
  }),
  HttpApiEndpoint.post('cue', '/lab/:film/cues/:scene/:cue', {
    params: { ...film, scene: Schema.String, cue: Schema.String },
    payload: CuePatch,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('knob', '/lab/:film/knobs/:scene/:knob', {
    params: { ...film, scene: Schema.String, knob: Schema.String },
    payload: KnobPatch,
    success: LabWrite,
    error: Refusals,
  }),
) {}

/** The film's writes stepped back and on, and its check: the lab's and the review's alike. */
export class StepsGroup extends HttpApiGroup.make('steps').add(
  HttpApiEndpoint.post('undo', '/lab/:film/undo', {
    params: film,
    payload: NoBody,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('redo', '/lab/:film/redo', {
    params: film,
    payload: NoBody,
    success: LabWrite,
    error: Refusals,
  }),
  /** `film check --static` now, the latest change, and what Undo and Redo would do. */
  HttpApiEndpoint.get('check', '/lab/:film/check', {
    params: film,
    success: CheckReport,
    error: Refusals,
  }),
) {}

/** The studio: the film's voice recorded in the browser, beat by beat. */
export class StudioGroup extends HttpApiGroup.make('studio').add(
  HttpApiEndpoint.get('beats', '/lab/:film/studio/beats', {
    params: film,
    success: StudioBeats,
    error: Refusals,
  }),
  /** A recording made the beat's take; a take that says something else is a TakeMismatch naming the attempt it saved. */
  HttpApiEndpoint.post('take', '/lab/:film/studio/takes/:beat', {
    params: { ...film, beat: Schema.String },
    payload: TakePost,
    success: StudioTake,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempts', '/lab/:film/studio/takes/:beat/attempts', {
    params: { ...film, beat: Schema.String },
    success: StudioAttempts,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempt', '/lab/:film/studio/takes/:beat/attempts/:file', {
    params: { ...film, beat: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('keep', '/lab/:film/studio/takes/:beat/keep', {
    params: { ...film, beat: Schema.String },
    payload: KeepPost,
    success: StudioTake,
    error: Refusals,
  }),
) {}

/** Where the review serves a file by its ref, and its phone copy: the rest of the path is the ref. */
export const REVIEW_FILES = '/review/files/';
export const REVIEW_PHONE = '/review/phone/';

/** The review: every folder with something to review, each file where it lies, a frame, a length. */
export class ReviewGroup extends HttpApiGroup.make('review').add(
  HttpApiEndpoint.get('index', '/review/index', {
    query: { fresh: Schema.optionalKey(Schema.String) },
    success: ReviewIndex,
    error: Refusals,
  }),
  /** The file, its byte ranges answered 206 (a phone's video seeks). */
  HttpApiEndpoint.get('file', `${REVIEW_FILES}*`, { success: FileBytes, error: Refusals }),
  /** Its 720p phone copy, once made (404 before). */
  HttpApiEndpoint.get('phone', `${REVIEW_PHONE}*`, { success: FileBytes, error: Refusals }),
  /** A JPEG of the video at `t` s (10% in without), `w` px wide. */
  HttpApiEndpoint.get('frame', '/review/frame', {
    query: {
      ref: Schema.String,
      t: Schema.optionalKey(Schema.Finite),
      w: Schema.optionalKey(Schema.Finite),
    },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.get('duration', '/review/duration', {
    query: { ref: Schema.String },
    success: ReviewDuration,
    error: Refusals,
  }),
) {}

/**
 * A film's choice points (`choice.ts`): listed, a variant picked (or
 * unpicked, or rejected), a level knob set, a variant approved or commented
 * on, each variant heard alone or in the film's mix, and the film's sound
 * checked after a pick.
 */
export class ChoicesGroup extends HttpApiGroup.make('choices').add(
  HttpApiEndpoint.get('films', '/review/films', { success: ReviewFilms, error: Refusals }),
  HttpApiEndpoint.get('list', '/lab/:film/choices', {
    params: film,
    success: FilmChoices,
    error: Refusals,
  }),
  /** A verb on a variant: the pick lands where the film declares it. */
  HttpApiEndpoint.post('pick', '/lab/:film/choices/pick', {
    params: film,
    payload: PickPost,
    success: ChoiceWrite,
    error: Refusals,
  }),
  /** A level point's knob written into `sound.ts`. */
  HttpApiEndpoint.post('knob', '/lab/:film/choices/knob', {
    params: film,
    payload: KnobPost,
    success: ChoiceWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('approve', '/lab/:film/choices/approve', {
    params: film,
    payload: ApprovePost,
    success: FilmChoices,
    error: Refusals,
  }),
  HttpApiEndpoint.post('comment', '/lab/:film/choices/comment', {
    params: film,
    payload: CommentPost,
    success: FilmChoices,
    error: Refusals,
  }),
  /** A variant's own file: a take, an attempt. */
  HttpApiEndpoint.get('alone', '/lab/:film/choices/alone', {
    params: film,
    query: { point: Schema.String, variant: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  /** The film's whole mix with the variant in place (m4a): a score option, a take. */
  HttpApiEndpoint.get('mix', '/lab/:film/choices/mix', {
    params: film,
    query: { point: Schema.String, variant: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  /** `film check --sound` now: dead air and balance in the mix the film makes as it stands. */
  HttpApiEndpoint.get('soundCheck', '/lab/:film/choices/check', {
    params: film,
    success: SoundCheck,
    error: Refusals,
  }),
) {}

/** Which render of each scene a project call is about (`main` when none). */
const variantField = { variant: Schema.optionalKey(Schema.String) };

/**
 * A film's project folder by its address tree (`catalogue.ts`): each scene's
 * render, its state and the owner's say; approvals (of scenes, an act's
 * current scenes, or every current scene) and comments. Each call runs `film
 * project` in a fresh process and answers the project as it now stands.
 */
export class ProjectGroup extends HttpApiGroup.make('project').add(
  HttpApiEndpoint.get('get', '/review/project/:film', {
    params: film,
    query: variantField,
    success: Project,
    error: Refusals,
  }),
  /** The scenes named approved as they are rendered, or an act's current scenes. */
  HttpApiEndpoint.post('approve', '/review/project/:film/approve', {
    params: film,
    payload: Schema.Struct({ address: Address, ...variantField }),
    success: Project,
    error: Refusals,
  }),
  /** Every scene whose render is current approved. */
  HttpApiEndpoint.post('approveAll', '/review/project/:film/approve-all', {
    params: film,
    payload: Schema.Struct(variantField),
    success: Project,
    error: Refusals,
  }),
  /** Something said of a scene's render, an act or the whole film. */
  HttpApiEndpoint.post('comment', '/review/project/:film/comment', {
    params: film,
    payload: Schema.Struct({
      address: Address,
      text: Schema.String.check(Schema.isNonEmpty()),
      ...variantField,
    }),
    success: Project,
    error: Refusals,
  }),
) {}

/** The lab's API, served while `film lab <film>` runs. */
export class LabHttpApi extends HttpApi.make('lab')
  .add(NotesGroup)
  .add(ScenesGroup)
  .add(StepsGroup)
  .add(StudioGroup) {}

/** The review's API, served by `film review`. */
export class ReviewHttpApi extends HttpApi.make('review')
  .add(ReviewGroup)
  .add(ChoicesGroup)
  .add(ProjectGroup)
  .add(StepsGroup) {}

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

/** The first segments `api`'s routes live under (`/lab/`, `/review/`): the API's own paths. */
export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => [
  ...new Set(routesOf(api).map((route) => `/${route.path.split('/')[1] ?? ''}/`)),
];

// ---------------------------------------------------------------------------
// The URLs a page puts in an <img>, <audio> or <video>, derived from the routes.

const labUrls = HttpApiClient.urlBuilder(LabHttpApi);
const reviewUrls = HttpApiClient.urlBuilder(ReviewHttpApi);

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

/** The review's URL for a file, by its ref. */
export const reviewFileUrl = (ref: string): string => `${REVIEW_FILES}${refPath(ref)}`;

/** The review's URL for a video's 720p phone copy, by its ref. */
export const reviewPhoneUrl = (ref: string): string => `${REVIEW_PHONE}${refPath(ref)}`;

/** A frame of a video, `w` px wide, at `t` s to the hundredth (10% in when none). */
export const reviewFrameUrl = (ref: string, t: Option.Option<number>, w: number): string => {
  const at = Option.match(t, { onNone: () => ({}), onSome: (s) => ({ t: Number(s.toFixed(2)) }) });
  return reviewUrls.review.frame({ query: { ref, w: Math.round(w), ...at } });
};

/** A variant of a choice point heard alone: a take's file, an attempt's. */
export const choiceAloneUrl = (film: string, point: string, variant: string): string =>
  reviewUrls.choices.alone({ params: { film }, query: { point, variant } });

/** The film's whole mix with a variant of a choice point in place (an m4a). */
export const choiceMixUrl = (film: string, point: string, variant: string): string =>
  reviewUrls.choices.mix({ params: { film }, query: { point, variant } });
