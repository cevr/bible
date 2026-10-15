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
import {
  Array as Arr,
  Duration,
  Effect,
  Match,
  Option,
  Schema,
  SchemaAST,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';
import {
  HttpApi,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from 'effect/http-api';
import { PartAddress } from './address.ts';
import { BoardFile } from './board.ts';
import { AskRecord, StepValues } from './ask.ts';
import type { Interval } from './time.ts';
import { isShortKey } from './shorts.ts';
import { onChoicesTab } from './point.ts';
import { Gave, OpId, Project, RenderVariantName, Took } from './catalogue.ts';
import { WaitTimeout } from './wait.ts';
import { ChoiceWrite, FilmChoices, KnobPost, PickPost, SoundCheck } from './choice.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import {
  LabDown,
  LabElsewhere,
  LookFailed,
  LookInvalid,
  LookLevelUnknown,
  LookOutOfRange,
  LookPlaceUnknown,
  LookPost,
  LookTaken,
  PagesBroken,
  ToolFailed,
} from './easel.ts';
import {
  CounselFailed,
  CounselUnreadable,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgePointUnjudged,
  JudgeRuleMissing,
} from './judge.ts';
import { ReviewDuration, ReviewFilms, ReviewFolder, ReviewIndex, ReviewVideo } from './review.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  BodyTooLarge,
  CatalogueInvalid,
  ChoiceUnknown,
  DraftUnknown,
  DraftUnread,
  ElevenLabsFailed,
  FilmUnknown,
  FreshProcessFailed,
  HeadUnavailable,
  MediaFailed,
  NoteNotFound,
  AskRefused,
  AskUnknown,
  PhoneCopyFailed,
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
  StagingCapReached,
  StagingTakeUnknown,
  StillUnknown,
  SttUntimed,
  TakeMismatch,
  TakeUnknown,
  TimelineUnresolved,
  UndoUnavailable,
  VariantUnknown,
  VerbRefused,
  VersionChanged,
  VersionMoved,
  BoardFileUnknown,
  BoardRefused,
} from './refusals.ts';
import { MoveForward, ProductionFile, ProductionId, Productions } from './production.ts';
import {
  ChangeId,
  CheckReport,
  CuePatch,
  HeadSource,
  KnobPatch,
  LabWrite,
  Note,
  NotePost,
  NotesFile,
  NotesWait,
  PageBuild,
  ReplyPost,
  RequestId,
  SceneCode,
  SceneSource,
  TakeWord,
} from './schema.ts';
import { KeepPost, StudioAttempts, StudioBeats, StudioTake, TakePost } from './studio.ts';
import { LineRead, Mark } from './delivery.ts';

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
 * take the lab will not make 422; a staging take past the day's cap 429; a
 * tool or a service that failed 502; the rest 500.
 */
const Refusals = [
  NoteNotFound.pipe(status(404)),
  AskUnknown.pipe(status(404)),
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
  BoardFileUnknown.pipe(status(404)),
  AttemptUnknown.pipe(status(404)),
  UnknownScene.pipe(status(404)),
  RouteUnknown.pipe(status(404)),
  LookPlaceUnknown.pipe(status(404)),
  LookLevelUnknown.pipe(status(404)),
  StagingTakeUnknown.pipe(status(404)),
  DraftUnknown.pipe(status(404)),
  AudioInvalid.pipe(status(400)),
  RequestInvalid.pipe(status(400)),
  LookInvalid.pipe(status(400)),
  RequestRefused.pipe(status(403)),
  UndoUnavailable.pipe(status(409)),
  RedoUnavailable.pipe(status(409)),
  StepNotNewest.pipe(status(409)),
  SourceChanged.pipe(status(409)),
  VerbRefused.pipe(status(409)),
  VersionChanged.pipe(status(409)),
  VersionMoved.pipe(status(409)),
  LabElsewhere.pipe(status(409)),
  AskRefused.pipe(status(409)),
  BodyTooLarge.pipe(status(413)),
  WriteNotJson.pipe(status(415)),
  RecordingLossy.pipe(status(415)),
  SourceRefused.pipe(status(422)),
  DraftUnread.pipe(status(422)),
  BoardRefused.pipe(status(422)),
  SourceShared.pipe(status(422)),
  TimelineUnresolved.pipe(status(422)),
  TakeMismatch.pipe(status(422)),
  RecordingInvalid.pipe(status(422)),
  PhoneCopyFailed.pipe(status(422)),
  UnknownVoice.pipe(status(422)),
  LookOutOfRange.pipe(status(422)),
  PagesBroken.pipe(status(422)),
  StagingCapReached.pipe(status(429)),
  ReviewToolFailed.pipe(status(502)),
  MediaFailed.pipe(status(502)),
  FreshProcessFailed.pipe(status(502)),
  ElevenLabsFailed.pipe(status(502)),
  SttUntimed.pipe(status(502)),
  LookFailed.pipe(status(502)),
  CatalogueInvalid.pipe(status(500)),
  ServerFailed.pipe(status(500)),
] as const;

/** Any failure a route answers with. */
export const Refusal = Schema.Union(Refusals);
export type Refusal = typeof Refusal.Type;

/**
 * A failure as a film tool prints it (`film look --json`, `film judge
 * --json`): a route's refusal exactly as the route answers it (tagged, its
 * fields), or the tool's own (no lab answering, the judge's), or
 * `ToolFailed` for any other. One shape for a tool to decode, whichever
 * side failed.
 */
export const ToolFailure = Schema.Union([
  ...Refusals,
  LabDown,
  ToolFailed,
  JudgePointUnjudged,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgeRuleMissing,
  CounselFailed,
  CounselUnreadable,
]);
export type ToolFailure = typeof ToolFailure.Type;

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
  request: Schema.optionalKey(RequestId),
  change: Schema.optionalKey(ChangeId),
});

/** `GET /api/films/<film>/steps`: the film's history as `CheckReport` gives it, without the check. */
export const Steps = Schema.Struct({
  latest: CheckReport.fields.latest,
  undo: CheckReport.fields.undo,
  redo: CheckReport.fields.redo,
  landed: CheckReport.fields.landed,
});
export type Steps = typeof Steps.Type;

/** A word of a take, by its index into the take's transcript (`core/talk.ts`). */
const TalkWordIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * A word of a talk's section as the lab's Transcript view reads it: its index
 * into the take, as the captions spell it (the talk's fixes), whether the
 * section strikes it, and, for a word it plays, when it is heard in the
 * section (seconds from the section's start, `voiced`).
 */
const TalkWord = Schema.Struct({
  index: TalkWordIndex,
  text: Schema.String,
  struck: Schema.Boolean,
  heard: Schema.optionalKey(Schema.Tuple([Schema.Finite, Schema.Finite])),
});
export type TalkWord = typeof TalkWord.Type;

/** A talk's section as the Transcript view reads it: its words from its first to its last, and its marks. */
const TalkSectionWords = Schema.Struct({
  id: Schema.String,
  take: Schema.String,
  words: Schema.Array(TalkWord),
  marks: Schema.Record(Schema.String, TalkWordIndex),
});

/**
 * `GET /api/films/<film>/talk`: a talk's sections in play order, as its
 * `talk.ts` cuts them on its takes' transcripts now (`talkCut`), each with
 * every word from its first to its last, struck or played.
 */
export const TalkWords = Schema.Struct({
  file: Schema.String,
  sections: Schema.Array(TalkSectionWords),
});
export type TalkWords = typeof TalkWords.Type;

/**
 * `POST /api/films/<film>/talk/cut` and `POST /api/films/<film>/talk/restore`:
 * the words `from`–`to` of `section`, struck or played again.
 */
export const TalkWordsPost = Schema.Struct({
  section: Schema.String,
  from: TalkWordIndex,
  to: TalkWordIndex,
});
export type TalkWordsPost = typeof TalkWordsPost.Type;

/**
 * `POST /api/films/<film>/talk/mark`: the mark `name` set on word `word` of
 * `section`. Any string, so a name the talk's decode would drop (`MarkName`)
 * reaches the server and is refused in its words, not the client's.
 */
export const TalkMarkPost = Schema.Struct({
  section: Schema.String,
  word: TalkWordIndex,
  name: Schema.String,
});

/**
 * A beat of a film's script as the Script page reads it beside the staged
 * film: what the film plays leaves it out (`scenesOf`), so it comes from the
 * script as it stands: the picture's brief and the beat's sources.
 */
const ScriptBeat = Schema.Struct({
  id: Schema.String,
  /** Its line as the script says it, marks and cues in braces; none for a beat that says nothing (left out by an older lab). */
  say: Schema.optionalKey(Schema.String),
  /** What the picture does, as the script says it; none where it says nothing. */
  picture: Schema.optionalKey(Schema.String),
  /** The beat's sources, as the script cites them. */
  cite: Schema.Array(Schema.String),
});
export type ScriptBeat = typeof ScriptBeat.Type;

/**
 * `GET /api/films/<film>/script`: each beat of the film's `script.ts` in its
 * order, as the file stands now (`film read script`, run fresh); no beats for
 * a film that keeps no script.
 */
export const ScriptBeats = Schema.Struct({
  film: Schema.String,
  beats: Schema.Array(ScriptBeat),
});
export type ScriptBeats = typeof ScriptBeats.Type;

/**
 * A beat's staging take as the Script reader shows it: ready (its audio,
 * served by `GET …/script/takes/:file`, its length and where each word is
 * heard in it), being voiced, not voiced (the lab keeps none ready:
 * `FILM_STAGING_FILL` off), or refused (the day's cap, a failed request).
 */
export const StagingTake = Schema.Union([
  Schema.TaggedStruct('Ready', {
    file: Schema.String,
    duration: Schema.Finite,
    words: Schema.Array(TakeWord),
  }),
  Schema.TaggedStruct('Voicing', {}),
  Schema.TaggedStruct('Unvoiced', {}),
  Schema.TaggedStruct('Refused', { reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type StagingTake = typeof StagingTake.Type;

/**
 * `GET /api/films/<film>/script/voice`: each spoken beat's staging take, in
 * the voice and marks the script has now, and the day's staging spend in
 * characters against its cap.
 */
export const ScriptVoice = Schema.Struct({
  film: Schema.String,
  spent: Schema.Int,
  cap: Schema.Int,
  beats: Schema.Array(Schema.Struct({ id: Schema.String, take: StagingTake })),
});
export type ScriptVoice = typeof ScriptVoice.Type;

/**
 * `POST /api/films/<film>/script/marks` (and a draft's): a beat's delivery
 * marks as they should read, its words unchanged, and the line the page
 * read when it made them (`read`: its words as the voice says them and
 * their marks). A write replaces the line's every mark, and a mark is on a
 * word by its index, so a write is refused once the line says other words
 * or carries other marks: the page reads it again rather than mark the
 * wrong word or write over marks made elsewhere. `read` is optional only so
 * a tab older than the lab (which sent none) is refused with words that
 * say to reload, not a payload that does not decode; it never writes.
 */
export const MarksPost = Schema.Struct({
  beat: Schema.String,
  marks: Schema.Array(Mark),
  read: Schema.optionalKey(LineRead),
});
export type MarksPost = typeof MarksPost.Type;

/**
 * `GET /api/series`: the app's series and their drafts, as the lab lists them
 * beside the films: each series by its folder's name and its plan's title,
 * each draft by its file's name and its own title.
 */
export const SeriesList = Schema.Struct({
  series: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      title: Schema.String,
      drafts: Schema.Array(Schema.Struct({ name: Schema.String, title: Schema.String })),
    }),
  ),
});
export type SeriesList = typeof SeriesList.Type;

/**
 * A beat of a series draft as the Script reader reads it (`core/draft.ts`):
 * its id (a talk's row number, a film's beat id), its label, its line with
 * its marks, what its picture does and its sources.
 */
const DraftBeatRead = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** Its line, marks and cues in braces; none for a beat that says nothing. */
  say: Schema.optionalKey(Schema.String),
  brief: Schema.optionalKey(Schema.String),
  cite: Schema.Array(Schema.String),
});
export type DraftBeatRead = typeof DraftBeatRead.Type;

/**
 * `GET /api/series/<series>/<draft>`: the draft's beats as its Markdown
 * stands now; and what a mark write answers, the draft as it leaves it.
 */
export const DraftRead = Schema.Struct({
  series: Schema.String,
  draft: Schema.String,
  title: Schema.String,
  beats: Schema.Array(DraftBeatRead),
});
export type DraftRead = typeof DraftRead.Type;

/**
 * What the owner says of a variant, a scene's render, an act or the film:
 * approve it as it is now, withdraw every approval of it, or comment on it.
 * A withdraw `given` an approve's op (its `Project.gave.op`) withdraws only
 * the approvals that approve gave: its exact undo, leaving every other
 * approval alone, another's given at the very same moment too. The one say
 * both the choices and the project take.
 */
export const Say = Schema.Union([
  Schema.TaggedStruct('Approve', {}),
  Schema.TaggedStruct('Withdraw', { given: Schema.OptionFromOptionalKey(OpId) }),
  Schema.TaggedStruct('Comment', { text: Schema.String.check(Schema.isNonEmpty()) }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Say = typeof Say.Type;

/** A withdraw: of every approval, or `given` an approve's op, of the approvals it gave alone. */
export const withdrawSay = (given: Option.Option<OpId> = Option.none()): Say => ({
  _tag: 'Withdraw',
  given,
});

/** `POST /api/films/<film>/choices/say`: a say on one variant of one point, as it is now. */
export const SayPost = Schema.Struct({ point: Schema.String, variant: Schema.String, say: Say });
export type SayPost = typeof SayPost.Type;

/**
 * `POST /api/review/sets/<folder>/<point>/say`: a say on one version of a set,
 * as it is now. An approve may name the run it is (`op`), as a scene's approve
 * does: the approval then carries it, and a withdraw given it takes back just
 * that one.
 */
export const SetSayPost = Schema.Struct({
  variant: Schema.String,
  say: Say,
  op: Schema.optionalKey(OpId),
});
export type SetSayPost = typeof SetSayPost.Type;

/**
 * What a set's say answers: the folder as the say leaves it; an approve
 * that named its run (`op`), what it `gave` (the scene whose approval it
 * added; none when the version was approved already); a withdraw given a
 * run, what it `took` (none of it when the approval was withdrawn since), as
 * a project's say answers (`Project.gave`, `Project.took`). Each optional on
 * the wire: any other say carries neither.
 */
export const SetSaid = Schema.Struct({
  ...ReviewFolder.fields,
  gave: Schema.OptionFromOptionalKey(Gave),
  took: Schema.OptionFromOptionalKey(Took),
});
export type SetSaid = typeof SetSaid.Type;

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
  /** The changes past `since`, held open up to `timeout` s (`WaitTimeout`). */
  HttpApiEndpoint.get('wait', `${FILM}/notes/wait`, {
    params: film,
    query: { since: Schema.Finite, timeout: WaitTimeout },
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
  /** The scene file's text now, and where its cues and knobs are written and read (the Source view). */
  HttpApiEndpoint.get('code', `${FILM}/scenes/:scene/code`, {
    params: { ...film, scene: Schema.String },
    success: SceneCode,
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

/**
 * A talk's words as the lab's Transcript view reads them, and its edits there:
 * words struck (Cut) or played again (Restore), and a mark set on a word (Mark
 * here). Each write rewrites `talk.ts` by its literal, as a scene write does.
 */
class TalkGroup extends HttpApiGroup.make('talk').add(
  HttpApiEndpoint.get('words', `${FILM}/talk`, {
    params: film,
    success: TalkWords,
    error: Refusals,
  }),
  HttpApiEndpoint.post('cut', `${FILM}/talk/cut`, {
    params: film,
    payload: TalkWordsPost,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('restore', `${FILM}/talk/restore`, {
    params: film,
    payload: TalkWordsPost,
    success: LabWrite,
    error: Refusals,
  }),
  HttpApiEndpoint.post('mark', `${FILM}/talk/mark`, {
    params: film,
    payload: TalkMarkPost,
    success: LabWrite,
    error: Refusals,
  }),
) {}

/**
 * The film's script as the Script page reads it beside the staged film: each
 * beat's picture and sources, each beat's staging take and its audio, and a
 * beat's delivery marks written.
 */
class ScriptGroup extends HttpApiGroup.make('script').add(
  HttpApiEndpoint.get('beats', `${FILM}/script`, {
    params: film,
    success: ScriptBeats,
    error: Refusals,
  }),
  HttpApiEndpoint.get('voice', `${FILM}/script/voice`, {
    params: film,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${FILM}/script/takes/:file`, {
    params: { ...film, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${FILM}/script/marks`, {
    params: film,
    payload: MarksPost,
    success: LabWrite,
    error: Refusals,
  }),
) {}

/** One series draft's routes. */
const DRAFT = `${API}/series/:series/:draft`;
const draftParams = { series: Schema.String, draft: Schema.String };

/**
 * The series drafts as the Script reader reads them beside the films: every
 * series and its drafts, a draft's beats, each spoken beat's staging take
 * and its audio (the films' staging voice and cache), and a beat's delivery
 * marks written into the draft's Markdown.
 */
class SeriesGroup extends HttpApiGroup.make('series').add(
  HttpApiEndpoint.get('list', `${API}/series`, { success: SeriesList, error: Refusals }),
  HttpApiEndpoint.get('read', DRAFT, { params: draftParams, success: DraftRead, error: Refusals }),
  HttpApiEndpoint.get('voice', `${DRAFT}/voice`, {
    params: draftParams,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${DRAFT}/takes/:file`, {
    params: { ...draftParams, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${DRAFT}/marks`, {
    params: draftParams,
    payload: MarksPost,
    success: DraftRead,
    error: Refusals,
  }),
) {}

/** A pick on a film's board: the panel, the try kept, and why. */
const BoardPick = Schema.Struct({
  panel: Schema.String,
  try: Schema.Int,
  why: Schema.OptionFromOptionalKey(Schema.String),
});

/** A beat's board approved or withdrawn. */
const BoardBeatPost = Schema.Struct({ beat: Schema.String });

/**
 * The film's storyboard (`core/board.ts`, `film board`): the record, an
 * image of it, a try kept, a beat's board approved or withdrawn. Notes on a
 * panel go through the notes' routes, the panel on the note.
 */
class BoardGroup extends HttpApiGroup.make('board').add(
  HttpApiEndpoint.get('read', `${FILM}/board`, {
    params: film,
    success: BoardFile,
    error: Refusals,
  }),
  HttpApiEndpoint.get('file', `${FILM}/board/files/:file`, {
    params: { ...film, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('pick', `${FILM}/board/pick`, {
    params: film,
    payload: BoardPick,
    success: BoardFile,
    error: Refusals,
  }),
  HttpApiEndpoint.post('approve', `${FILM}/board/approve`, {
    params: film,
    payload: BoardBeatPost,
    success: BoardFile,
    error: Refusals,
  }),
  HttpApiEndpoint.post('withdraw', `${FILM}/board/withdraw`, {
    params: film,
    payload: BoardBeatPost,
    success: BoardFile,
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
   * folder as the say leaves it, and what it gave or took (`SetSaid`).
   */
  HttpApiEndpoint.post('say', `${REVIEW}/sets/:folder/:point/say`, {
    params: { folder: Schema.String, point: Schema.String },
    payload: SetSayPost,
    success: SetSaid,
    error: Refusals,
  }),
) {}

/** One section of an ask's page as sent: the step it answers and each answer's value by its name. */
const AskSectionPost = Schema.Struct({ step: Schema.String, values: StepValues });
type AskSectionPost = typeof AskSectionPost.Type;

/**
 * What an ask's page sends: each section it shows (`sectionsOf`), in order,
 * at least one. A page opened before the one-page ask (2026-10-15) sends
 * one step as it did (`{step, values}`), taken as one section, so a tab
 * left open across the change still sends. The forms are disjoint: the old
 * one carries no `sections`, so a body with sections that do not decode is
 * refused, never read as the old form with its sections dropped.
 */
const AskAnswerPost = Schema.Union([
  Schema.Struct({ sections: Schema.Array(AskSectionPost).check(Schema.isMinLength(1)) }),
  Schema.Struct({ ...AskSectionPost.fields, sections: Schema.optionalKey(Schema.Never) }),
]);
type AskAnswerPost = typeof AskAnswerPost.Type;

/** The sections an answer post carries: its own, or the one step an older page sends. */
export const sectionsPosted = (post: AskAnswerPost): ReadonlyArray<AskSectionPost> => {
  if ('step' in post) return [{ step: post.step, values: post.values }];
  return post.sections;
};

/**
 * The asks: an agent's decision pages (`core/ask.ts`), each read as its
 * record and answered as one page, its sections in order; the answers move
 * its machine and are kept, so a reload or another device opens it where it
 * was left.
 */
class AsksGroup extends HttpApiGroup.make('asks').add(
  HttpApiEndpoint.get('read', `${API}/asks/:ask`, {
    params: { ask: Schema.String },
    success: AskRecord,
    error: Refusals,
  }),
  HttpApiEndpoint.post('answer', `${API}/asks/:ask/answer`, {
    params: { ask: Schema.String },
    payload: AskAnswerPost,
    success: AskRecord,
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
 * A look (`core/easel.ts`): stills of a scene as its sources stand, drawn by
 * a page the lab holds warm, written under the film's `out/<film>/look/` and
 * answered by their paths. A tool's call (`film look`), not a page's: it
 * writes files, never source, and waits for the pages' build of every save
 * made before it; a build that fails is answered as `PagesBroken`, its words.
 */
class LooksGroup extends HttpApiGroup.make('looks').add(
  HttpApiEndpoint.post('take', `${FILM}/looks`, {
    params: film,
    payload: LookPost,
    success: LookTaken,
    error: Refusals,
  }),
) {}

/**
 * The lab's own pages: a wait, held open up to `timeout` s (`WaitTimeout`),
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
      timeout: WaitTimeout,
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
/**
 * The productions (`core/production.ts`): every ledger, which the page lays
 * the review's folders into as each production's timeline, and a production
 * moved forward from the version the mover saw (`VersionMoved` once it has
 * moved since), answered with its ledger as the move leaves it.
 */
class ProductionsGroup extends HttpApiGroup.make('productions').add(
  HttpApiEndpoint.get('list', `${API}/productions`, { success: Productions, error: Refusals }),
  HttpApiEndpoint.post('forward', `${API}/productions/:production/versions`, {
    params: { production: ProductionId },
    payload: MoveForward,
    success: ProductionFile,
    error: Refusals,
  }),
) {}

export class LabHttpApi extends HttpApi.make('lab')
  .add(NotesGroup)
  .add(ScenesGroup)
  .add(StepsGroup)
  .add(TalkGroup)
  .add(ScriptGroup)
  .add(SeriesGroup)
  .add(BoardGroup)
  .add(StudioGroup)
  .add(ReviewGroup)
  .add(ChoicesGroup)
  .add(ProjectGroup)
  .add(LooksGroup)
  .add(ProductionsGroup)
  .add(PageGroup)
  .add(AsksGroup) {}

/** The first segments `api`'s routes live under (`/api/`): the API's own paths. */
export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => {
  const prefixes = new Set<string>();
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) => void prefixes.add(`/${endpoint.path.split('/')[1] ?? ''}/`),
  });
  return [...prefixes];
};

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

/** The studio's pages, each one HTML entry: its review, its lab, its player. */
export type PageName = 'review' | 'lab' | 'player';

/**
 * The pages the lab serves, each one HTML entry: the studio's, and the
 * render page (a film with no chrome, whose handle the renderer and the
 * easel drive).
 */
export type AppPage = PageName | 'render';

/**
 * A value the URL may leave out: blank text (empty, or only spaces) is none,
 * though `Number` reads it as 0; anything else reads by `codec`.
 */
const maybe = <A>(codec: Schema.Codec<A, string>) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.Option(Schema.toType(codec)),
      SchemaTransformation.transformEffect<Option.Option<A>, string>({
        decode: (text) => {
          if (text.trim() === '') return Effect.succeedNone;
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
 * How often, at most, `#t=` follows a time that moves (play, a drag), in ms:
 * the time key's throttle, and the window the player's writer holds to
 * before it encodes a link (`tInUrl`, `player/main.ts`).
 */
export const TIME_EVERY_MS = 250;

/**
 * A time on the hash (`#t=12.5`), in seconds: in a scene's lab, from the
 * scene's start (negative before it); elsewhere, from the film's or the
 * video's. None opens the page at its own start. It follows the playhead at
 * most every `TIME_EVERY_MS`, and never makes a history entry.
 */
const time = Field.key(maybe(Codec.Finite), {
  default: Option.none(),
  throttle: Duration.millis(TIME_EVERY_MS),
});
const At = Field.struct({ t: time });

/** One end of an A–B loop: a number written there (`maybe`'s), so a blank end (`,2`, `%20,2`) is no point. */
const loopPoint = (text: string): Option.Option<number> =>
  Option.flatten(Schema.decodeOption(maybe(Codec.Finite))(text));

/**
 * An A–B loop (`loop=10,14`): film seconds, its in point before its out
 * point; anything else (a blank end among it) reads as no loop.
 */
const LoopSpan: Schema.Codec<Interval, string> = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Struct({ from: Schema.Finite, to: Schema.Finite }),
    SchemaTransformation.transformEffect({
      decode: (text: string) =>
        Effect.fromOption(
          Option.filter(
            Option.flatMap(
              Option.liftPredicate(text.split(','), (parts) => parts.length === 2),
              ([from = '', to = '']) => Option.all({ from: loopPoint(from), to: loopPoint(to) }),
            ),
            (span) => span.to > span.from,
          ),
        ).pipe(
          Effect.mapError(
            () => new SchemaIssue.InvalidValue({ message: `an in and an out point` }, text),
          ),
        ),
      encode: (span: Interval) => Effect.succeed(`${span.from},${span.to}`),
    }),
  ),
);

/**
 * The lab's hash: the time (`At`'s), and the A–B loop (`loop=<a>,<b>`, film
 * seconds on a film's lab and a scene's alike, so it never moves with the
 * path). The loop set, changed or stopped is a step Back walks.
 */
const LabAt = Field.struct({
  t: time,
  loop: Field.key(maybe(LoopSpan), { default: Option.none(), history: 'push' }),
});

/** A film by its name: one path segment (a short's `/` is written `%2F`). */
const filmParams = { film: Codec.Segment };

/** A key naming something selected in a view (a cue, a note, a card): each change is a step Back walks. */
const cited = Field.key(Codec.Text, { default: '', history: 'push' });

/** A key refining how a view is shown (a pair's other side, the sound heard): no step of its own. */
const refined = Field.key(Codec.Text, { default: '' });

/**
 * The thing whose inspector is open (`?inspect=`, `useInspectorPlace`): on
 * Choices a variant of the card in focus (`?point=`), on a set one of its
 * versions. Its opening is a step Back walks; none open is the page's first,
 * so a link from before the key lands as it did.
 */
const inspect = cited;

/**
 * The still open full size (`?still=`): a folder's sheet or still by its ref, or a
 * set's version at the moment shown by its id. Its opening is a step Back walks, as
 * every sheet's is; none open is the page's first.
 */
const still = cited;

/**
 * The views of a comparison set (`?view=`): all side by side, a pair, the
 * pair's wipe, the moments, the pair's difference at a moment; and
 * `notes`, a view no longer shown, read so an old link opens all with the
 * first version's Info, where its notes now are.
 */
export const SET_VIEWS = ['all', 'pair', 'wipe', 'moments', 'diff', 'notes'] as const;

/** A moment's index (`?m=`): a whole number from 0. */
const MomentIndex = Codec.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** The lab's compare with HEAD (`?view=`): off, a wipe, a blink, or the difference. */
export const COMPARE_VIEWS = ['off', 'wipe', 'blink', 'diff'] as const;
export type CompareView = (typeof COMPARE_VIEWS)[number];

/**
 * How the lab compares with HEAD: each mode the owner picks is a step Back
 * walks; the compare's own moves (the wipe's split, a held blink) are the
 * viewer's, never in the link (`lab/view-state.ts`).
 */
const compareView = Field.key(Codec.literals(COMPARE_VIEWS), { default: 'off', history: 'push' });

/**
 * The lab's selection keys: a cue or a knob of the path's scene, a note, and
 * the studio's beat (a scene's take; with none the studio is on the path's),
 * and the Source view open (`code`: `follow`; `live`, Code mode, the code
 * beside the picture; or a line of the scene's file; `lab/source/open.ts`),
 * shut with the key absent. A talk's section (a
 * scene of a talk) adds its words selected (`words`: `<a>-<b>`, take word
 * indices) and the Transcript view open (`text`: `follow`, or a word;
 * `lab/transcript/open.ts`); both absent, the lab is as it was.
 */
const LabSelection = Field.struct({
  cue: cited,
  knob: cited,
  note: cited,
  beat: cited,
  view: compareView,
  code: cited,
  words: cited,
  text: cited,
});

/**
 * What the Script page selects in a beat (the path's scene): one of a cue
 * (`cue`), a mark of its line (`mark`) or its words (`words`: `<a>-<b>`,
 * word indices of the line as it is said); and the note selected (`note`).
 */
const ScriptSelection = Field.struct({
  cue: cited,
  mark: cited,
  words: cited,
  note: cited,
});

/**
 * How the Board shows a panel (`?view=`): the animatic (each panel held from
 * its mark on the narration's clock), the compare (the scene's own frame at
 * the panel's mark, the panel beside it) or the draw (the sketch surface over
 * the panel). Each is a step Back walks.
 */
export const BOARD_VIEWS = ['animatic', 'compare', 'draw'] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];

/**
 * What the Board picks in a beat (the path's scene): a panel by the mark it
 * is held from (`panel`), the try shown in it (`try`; its kept try when
 * none), how it is shown (`view`) and the note selected (`note`).
 */
const BoardSelection = Field.struct({
  panel: cited,
  try: cited,
  view: Field.key(Codec.literals(BOARD_VIEWS), { default: 'animatic', history: 'push' }),
  note: cited,
});

/**
 * A film's player on its choices and its project: the sound heard over the
 * picture (`?heard=<point>&variant=<id>` for a variant in place, `heard=own`
 * for the picture's own sound; none heard is the page's first) and the
 * picture played (`?picture=<ref>`).
 */
const FILM_PLAYER = { heard: refined, variant: refined, picture: refined };

/**
 * How a film's choices and its project are shown: only the points in one
 * state (`?only=stale`, `unapproved`, `comments`: `SHOWN_ONLY`), every
 * point when it is empty. The view filtered is a step Back walks, as a set's
 * view is: a move that only shows or hides points (Go to clearing the filter
 * that hid its point) never writes over the filtered view. The findings
 * sheet is shown or not (`?findings=1`): a view a reviewer cites, and a step
 * Back closes, as every other sheet is.
 */
const FILM_SHOWN = {
  only: Field.key(Codec.Text, { default: '', history: 'push' }),
  findings: Field.key(Codec.Flag, { default: false, history: 'push' }),
};

/** `?heard=` for the picture's own sound. */
export const OWN_SOUND = 'own';

/**
 * Every place a page is at. Review: home `/`, a folder of renders
 * `/sets/<folder>` (its still open full size), a comparison set
 * `/sets/<folder>/<point>` (its view, pair, moment, time and still open), a
 * film's choices (the sound heard, the picture and its time) and its
 * project (the card in focus). Player: a film's scenes
 * (the tape) `/films/<film>/scenes[/<scene>]#t=`, the path's scene the one
 * selected and `#t=` the playhead in film time on both, and its plain preview
 * `/films/<film>/play#t=`. Lab: a film
 * `/films/<film>/lab#t=` (film time) or one of its scenes
 * `/films/<film>/lab/<scene>?cue=#t=` (scene time), with the selection; and
 * its script, the lab's second page on the same staged film,
 * `/films/<film>/script#t=` or a beat of it
 * `/films/<film>/script/<scene>?mark=#t=`, with what is selected in the beat;
 * and its board, the lab's third page on the staged film, where the film's
 * work starts: `/films/<film>/board#t=` or a beat of it
 * `/films/<film>/board/<scene>?panel=&try=&view=#t=`, with the panel picked.
 * Render: a film's export page `/films/<film>/export`, the film staged with
 * no chrome and its handle on `window.__film` (`mountRender`), which the
 * easel opens on the lab (`film look`); no reviewer's view, so it holds no
 * time and no selection.
 */
export const Places = {
  home: Place.make({ path: '/' }),
  /** A production's timeline, the version in focus in `?v=` (none: the current one). */
  production: Place.make({
    path: '/productions/:production',
    params: { production: Codec.Segment },
    query: Field.struct({ v: Field.key(Codec.Int, { default: 0, history: 'push' }) }),
  }),
  folder: Place.make({
    path: '/sets/:folder',
    params: { folder: Codec.Segment },
    query: Field.struct({ still }),
  }),
  set: Place.make({
    path: '/sets/:folder/:point',
    params: { folder: Codec.Segment, point: Codec.Segment },
    query: Field.struct({
      view: Field.key(Codec.literals(SET_VIEWS), { default: 'all', history: 'push' }),
      other: refined,
      // A moment chosen is a step Back walks; a ←/→ step through the moments follows in place.
      m: Field.key(MomentIndex, { default: 0, history: 'push' }),
      inspect,
      still,
    }),
    hash: At,
  }),
  choices: Place.make({
    path: '/films/:film/choices',
    params: filmParams,
    // The card in focus (`?point=`), as on the project: a link lands on it; and the variant
    // of it whose inspector is open (`?inspect=`).
    query: Field.struct({ point: cited, inspect, ...FILM_PLAYER, ...FILM_SHOWN }),
    hash: At,
  }),
  project: Place.make({
    path: '/films/:film/project',
    params: filmParams,
    query: Field.struct({ point: cited, ...FILM_PLAYER, ...FILM_SHOWN }),
    hash: At,
  }),
  scenes: Place.make({ path: '/films/:film/scenes', params: filmParams, hash: At }),
  scene: Place.make({
    path: '/films/:film/scenes/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    hash: At,
  }),
  play: Place.make({ path: '/films/:film/play', params: filmParams, hash: At }),
  lab: Place.make({
    path: '/films/:film/lab',
    params: filmParams,
    query: Field.struct({ note: cited, view: compareView }),
    hash: LabAt,
  }),
  labScene: Place.make({
    path: '/films/:film/lab/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: LabSelection,
    hash: LabAt,
  }),
  script: Place.make({
    path: '/films/:film/script',
    params: filmParams,
    query: Field.struct({ note: cited }),
    hash: LabAt,
  }),
  scriptBeat: Place.make({
    path: '/films/:film/script/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: ScriptSelection,
    hash: LabAt,
  }),
  board: Place.make({
    path: '/films/:film/board',
    params: filmParams,
    query: Field.struct({ note: cited }),
    hash: LabAt,
  }),
  boardBeat: Place.make({
    path: '/films/:film/board/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: BoardSelection,
    hash: LabAt,
  }),
  export: Place.make({ path: '/films/:film/export', params: filmParams }),
  /** A series draft in the Script reader. */
  draft: Place.make({
    path: '/series/:series/:draft',
    params: { series: Codec.Segment, draft: Codec.Segment },
  }),
  /** A beat of a series draft in the Script reader, with its words selected (`?words=<a>-<b>`). */
  draftBeat: Place.make({
    path: '/series/:series/:draft/:beat',
    params: { series: Codec.Segment, draft: Codec.Segment, beat: Codec.Segment },
    query: Field.struct({ words: cited }),
  }),
  /** An agent's ask: its decision page (`core/ask.ts`), at the step its run is on; a Board still open full size. */
  ask: Place.make({
    path: '/asks/:ask',
    params: { ask: Codec.Segment },
    query: Field.struct({ still }),
  }),
};

/** The page each place is served by, the first that holds a path winning. */
const PAGES: ReadonlyArray<readonly [Place.Place<unknown>, AppPage]> = [
  [Places.home, 'review'],
  [Places.production, 'review'],
  [Places.folder, 'review'],
  [Places.set, 'review'],
  [Places.choices, 'review'],
  [Places.project, 'review'],
  [Places.scenes, 'player'],
  [Places.scene, 'player'],
  [Places.play, 'player'],
  [Places.lab, 'lab'],
  [Places.labScene, 'lab'],
  [Places.script, 'lab'],
  [Places.scriptBeat, 'lab'],
  [Places.board, 'lab'],
  [Places.boardBeat, 'lab'],
  [Places.export, 'render'],
  [Places.ask, 'review'],
  [Places.draft, 'review'],
  [Places.draftBeat, 'review'],
];

/** The page `pathname` serves, if any: a path no place declares (a chunk, a typo, an old `/lab`) serves none. */
export const pageAt = (pathname: string): Option.Option<AppPage> =>
  Option.map(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, pathname))),
    ([, page]) => page,
  );

/**
 * How the viewer's move from `from` to `to` enters history, as the place
 * `to` is on declares it (`Place.history`): a new path or a cited key is a
 * step Back walks, a refinement or the time rewrites the entry. The one
 * owner of the policy: a page that moves for a reason names the reason
 * (`addressOn`), never the move, and a page that sets a place's value
 * (`UrlState.set`/`update`, `UrlAtom.place`) enters history by the same
 * declaration. An href off every place is a step.
 */
export const pageMove = (from: string, to: string): 'push' | 'replace' =>
  Option.match(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, to))),
    {
      onNone: () => 'push',
      onSome: ([place]) => Place.history(place, from, to).history,
    },
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
  Places.script,
  Places.scriptBeat,
  Places.board,
  Places.boardBeat,
  Places.export,
];

/** The film `href`'s path names (`/films/<film>/…`), if it names one. */
export const filmOfPage = (href: string): Option.Option<string> =>
  Option.firstSomeOf(
    FILM_PLACES.map((place) => Option.map(Place.decode(place, href), (v) => v.path.film)),
  );

/** No time on the hash: the page opens at its own start. */
const START = { t: Option.none<number>() };

/** A film player's keys and how its points are shown, at the page's defaults. */
const NOTHING_HEARD = { heard: '', variant: '', picture: '', only: '', findings: false };

/** The lab's selection keys, none set. */
const NOTHING_SELECTED = {
  cue: '',
  knob: '',
  note: '',
  beat: '',
  view: 'off' as const,
  code: '',
  words: '',
  text: '',
};

/** What the lab has selected in a scene: a cue or a knob by name, a note by id, the studio's beat. */
interface LabPicked {
  readonly cue?: string;
  readonly knob?: string;
  readonly note?: string;
  readonly beat?: string;
  readonly view?: CompareView;
  /** The Source view open (`?code=`): `follow`, `live` (Code mode) or a line. */
  readonly code?: string;
  /** A talk's words selected (`?words=`): `<a>-<b>`. */
  readonly words?: string;
  /** The Transcript view open (`?text=`): `follow` or a word. */
  readonly text?: string;
}

/** The Script page's selection keys, none set. */
const NOTHING_SCRIPTED = { cue: '', mark: '', words: '', note: '' };

/** What the Script page has selected in a beat: a cue, a mark or words (`<a>-<b>`), and the note. */
interface ScriptPicked {
  readonly cue?: string;
  readonly mark?: string;
  readonly words?: string;
  readonly note?: string;
}

/** The Board's selection keys, none set. */
const NOTHING_BOARDED = { panel: '', try: '', view: 'animatic' as const, note: '' };

/** What the Board has picked in a beat: a panel by its mark, the try shown, the view, and the note. */
interface BoardPicked {
  readonly panel?: string;
  readonly try?: string;
  readonly view?: BoardView;
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
  /** A production's timeline, version `v` in focus (0: the current one). */
  production: (production: string, v = 0): string =>
    Place.href(Places.production, { path: { production }, query: { v }, hash: {} }),
  /** An agent's ask, at the step its run is on. */
  ask: (ask: string): string =>
    Place.href(Places.ask, { path: { ask }, query: { still: '' }, hash: {} }),
  /** A series draft in the Script reader. */
  draft: (series: string, draft: string): string =>
    Place.href(Places.draft, { path: { series, draft }, query: {}, hash: {} }),
  /** A beat of a series draft, with its words `words` (`<a>-<b>`) selected. */
  draftBeat: (series: string, draft: string, beat: string, words = ''): string =>
    Place.href(Places.draftBeat, { path: { series, draft, beat }, query: { words }, hash: {} }),
  folder: (folder: string): string =>
    Place.href(Places.folder, { path: { folder }, query: { still: '' }, hash: {} }),
  /** A comparison set, with the sheet of its version `inspect` open. */
  set: (folder: string, point: string, inspect = ''): string =>
    Place.href(Places.set, {
      path: { folder, point },
      query: { view: 'all', other: '', m: 0, inspect, still: '' },
      hash: START,
    }),
  /** A film's choices, with the card of `point` in focus and the sheet of its variant `inspect` open. */
  choices: (film: string, point = '', inspect = ''): string =>
    Place.href(Places.choices, {
      path: { film },
      query: { point, inspect, ...NOTHING_HEARD },
      hash: START,
    }),
  /** A film's project, with the card of `point` in focus. */
  project: (film: string, point = ''): string =>
    Place.href(Places.project, {
      path: { film },
      query: { point, ...NOTHING_HEARD },
      hash: START,
    }),
  /** A film's Scenes, at film time `t`. */
  scenes: (film: string, t: Option.Option<number> = Option.none()): string =>
    Place.href(Places.scenes, { path: { film }, query: {}, hash: timeOf(t) }),
  /** A film's Scenes with `scene` selected, at film time `t`. */
  scene: (film: string, scene: string, t: Option.Option<number> = Option.none()): string =>
    Place.href(Places.scene, { path: { film, scene }, query: {}, hash: timeOf(t) }),
  play: (film: string, t: Option.Option<number> = Option.none()): string =>
    Place.href(Places.play, { path: { film }, query: {}, hash: timeOf(t) }),
  /** A film's export page: the render page, staged for the easel's stills. */
  export: (film: string): string =>
    Place.href(Places.export, { path: { film }, query: {}, hash: {} }),
  /** The lab on `film`, at film time `t`, comparing with HEAD by `view`, looping `loop`. */
  lab: (
    film: string,
    t: Option.Option<number> = Option.none(),
    view: CompareView = 'off',
    loop: Option.Option<Interval> = Option.none(),
  ): string =>
    Place.href(Places.lab, {
      path: { film },
      query: { note: '', view },
      hash: { t, loop },
    }),
  /** The lab on `scene` of `film`, at scene time `t`, with what is `picked` there, looping `loop`. */
  labScene: (
    film: string,
    scene: string,
    picked: LabPicked = {},
    t: Option.Option<number> = Option.none(),
    loop: Option.Option<Interval> = Option.none(),
  ): string =>
    Place.href(Places.labScene, {
      path: { film, scene },
      query: { ...NOTHING_SELECTED, ...picked },
      hash: { t, loop },
    }),
  /** The Script on `film`, at film time `t`, with note `note` selected, looping `loop`. */
  script: (
    film: string,
    t: Option.Option<number> = Option.none(),
    note = '',
    loop: Option.Option<Interval> = Option.none(),
  ): string => Place.href(Places.script, { path: { film }, query: { note }, hash: { t, loop } }),
  /** The Script on beat `scene` of `film`, at scene time `t`, with what is `picked` there, looping `loop`. */
  scriptBeat: (
    film: string,
    scene: string,
    picked: ScriptPicked = {},
    t: Option.Option<number> = Option.none(),
    loop: Option.Option<Interval> = Option.none(),
  ): string =>
    Place.href(Places.scriptBeat, {
      path: { film, scene },
      query: { ...NOTHING_SCRIPTED, ...picked },
      hash: { t, loop },
    }),
  /** The Board on `film`, at film time `t`, with note `note` selected, looping `loop`. */
  board: (
    film: string,
    t: Option.Option<number> = Option.none(),
    note = '',
    loop: Option.Option<Interval> = Option.none(),
  ): string => Place.href(Places.board, { path: { film }, query: { note }, hash: { t, loop } }),
  /** The Board on beat `scene` of `film`, at scene time `t`, with what is `picked` there, looping `loop`. */
  boardBeat: (
    film: string,
    scene: string,
    picked: BoardPicked = {},
    t: Option.Option<number> = Option.none(),
    loop: Option.Option<Interval> = Option.none(),
  ): string =>
    Place.href(Places.boardBeat, {
      path: { film, scene },
      query: { ...NOTHING_BOARDED, ...picked },
      hash: { t, loop },
    }),
};

/**
 * The studio's parts, in the page bar's order: Films (the home, every
 * film's), then a film's Board (where its work starts, as a studio's does),
 * Scenes, Lab, Script, Choices, Project and Play. ⇧1-⇧8 go to them in this
 * order.
 */
export const PARTS = [
  'films',
  'board',
  'scenes',
  'lab',
  'script',
  'choices',
  'project',
  'play',
] as const;
export type Part = (typeof PARTS)[number];

/** Each part's name, as the page bar prints it. */
export const PART_TITLE: Readonly<Record<Part, string>> = {
  films: 'Films',
  board: 'Board',
  scenes: 'Scenes',
  lab: 'Lab',
  script: 'Script',
  choices: 'Choices',
  project: 'Project',
  play: 'Play',
};

/**
 * Whether `film` has `part`: a film has every part; a short (`<film>/shorts/<id>`)
 * is only played and seen as scenes, with no board, lab, script, choices or project of its own.
 */
export const hasPart = (film: string, part: Part): boolean =>
  !isShortKey(film) || part === 'films' || part === 'scenes' || part === 'play';

/** The parts whose `#t=` is the film's time: a move between them keeps the frame. */
const FILM_TIME_PARTS: ReadonlySet<Part> = new Set<Part>([
  'board',
  'scenes',
  'lab',
  'script',
  'play',
]);

/** The film time a page of `part` at `t` hands the page bar to keep: none from a part whose time is not the film's. */
export const filmTimeOn = (part: Part, t: Option.Option<number>): Option.Option<number> =>
  Option.filter(t, () => FILM_TIME_PARTS.has(part));

/**
 * The page of `part` on `film`, at its defaults (Films names no film);
 * the Board, Scenes, the Lab, the Script and Play at film time `t`, the frame
 * a move between them keeps.
 */
export const partHref = (
  part: Part,
  film: string,
  t: Option.Option<number> = Option.none(),
): string =>
  ({
    films: () => pageHref.home(),
    board: () => pageHref.board(film, t),
    scenes: () => pageHref.scenes(film, t),
    lab: () => pageHref.lab(film, t),
    script: () => pageHref.script(film, t),
    choices: () => pageHref.choices(film),
    project: () => pageHref.project(film),
    play: () => pageHref.play(film, t),
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

/** `text` as a path holds it (`Codec.Segment`): none for a name no path can hold (`.`, `..`). */
const asSegment = Schema.decodeOption(Codec.Segment);

/** A query key's value that an old link moves into a path: none when no path can hold it. */
const segmentParam = (query: URLSearchParams, key: string): Option.Option<string> =>
  Option.flatMap(param(query, key), asSegment);

/** The lab's place an old `sel=<cue|knob>:<scene>:<name>` named, on `film`. */
const labOfSelection = (film: string, sel: Option.Option<string>): string =>
  Option.getOrElse(
    Option.flatMap(sel, (raw) => {
      const [kind = '', scene = '', ...rest] = raw.split(':');
      const name = rest.join(':');
      if ((kind !== 'cue' && kind !== 'knob') || name === '') return Option.none();
      return Option.map(asSegment(scene), (s) => pageHref.labScene(film, s, { [kind]: name }));
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

/**
 * The export page an old render link names: Play's with `?export`
 * (`/films/<f>/play?export`, the easel's before the render page had a
 * place) or the root's (`/?film=<f>&export`, the PreviewServer's form), the
 * rest of its query (the build or wedge it pins, captions) kept.
 */
const exportOfQuery = (
  pathname: string,
  rootFilm: Option.Option<string>,
  query: URLSearchParams,
): Option.Option<string> => {
  const film = Option.orElse(
    Option.map(Place.decode(Places.play, pathname), (value) => value.path.film),
    () =>
      Option.flatMap(
        Option.liftPredicate(pathname, (p) => p === '/'),
        () => rootFilm,
      ),
  );
  return Option.map(film, (f) => {
    const kept = new URLSearchParams(query);
    kept.delete('export');
    kept.delete('film');
    return Option.match(
      Option.liftPredicate(kept.toString(), (search) => search !== ''),
      {
        onNone: () => pageHref.export(f),
        onSome: (search) => `${pageHref.export(f)}?${search}`,
      },
    );
  });
};

/** The place an old link's path and query name, if they name one. */
const legacyPath = (pathname: string, query: URLSearchParams): Option.Option<string> => {
  // Each value an old link moves into a path is read once, as the path holds it: a name no path
  // can hold (`.`, `..`) names nothing.
  const film = segmentParam(query, 'film');
  if (query.has('export')) return exportOfQuery(pathname, film, query);
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
  const project = segmentParam(query, 'project');
  if (Option.isSome(project)) return Option.some(pageHref.project(project.value));
  if (Option.isSome(film)) {
    if (lookbook) return Option.some(pageHref.scenes(film.value));
    if (lab) return Option.some(pageHref.lab(film.value));
    return Option.some(pageHref.choices(film.value));
  }
  return Option.flatMap(segmentParam(query, 'folder'), (folder) =>
    Option.some(
      Option.match(segmentParam(query, 'set'), {
        onNone: () => pageHref.folder(folder),
        onSome: (point) => setOfQuery(folder, point, query),
      }),
    ),
  );
};

/**
 * `href` with its film time on the hash as `#t=`, where its place reads film
 * time (the player, the Scenes' tape with a scene selected or not, a lab with
 * no scene).
 */
const withFilmTime = (href: string, t: number): string => {
  const hash = timeOf(Option.some(t));
  return Option.getOrElse(
    Option.firstSomeOf([
      Option.map(Place.decode(Places.play, href), (v) => Place.href(Places.play, { ...v, hash })),
      Option.map(Place.decode(Places.scenes, href), (v) =>
        Place.href(Places.scenes, { ...v, hash }),
      ),
      Option.map(Place.decode(Places.scene, href), (v) => Place.href(Places.scene, { ...v, hash })),
      Option.map(Place.decode(Places.lab, href), (v) =>
        Place.href(Places.lab, { ...v, hash: { ...v.hash, ...hash } }),
      ),
    ]),
    () => href,
  );
};

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
 * `href`, when it is a project with a choice's card in focus, on Choices at
 * that card: the project holds no choice's card now (design language §7);
 * the Choices tab holds every one. A scene's render (`render:scenes:<id>`)
 * stays on the project, where its scene's sheet opens.
 */
const choiceOffProject = (href: string): Option.Option<string> =>
  Option.flatMap(Place.decode(Places.project, href), (value) =>
    Option.map(
      Option.filter(
        Option.liftPredicate(value.query.point, (p) => p !== ''),
        onChoicesTab,
      ),
      // The card in focus, its sheet shut: a project link named a card, never a variant.
      () => Place.href(Places.choices, { ...value, query: { ...value.query, inspect: '' } }),
    ),
  );

/**
 * The place an old link names, if `href` is one: `/lab?film=<f>[&sel=…]`,
 * `/player?film=<f>[&lookbook|&lab]`, `/?project=<f>`,
 * `/?film=<f>[&lookbook|&lab]`, `/?folder=<ref>[&set=<point>…]`, a render
 * link (`/films/<f>/play?export`, `/?film=<f>&export`, now the film's export
 * page `/films/<f>/export`), a bare
 * `#<seconds>` on a place that reads film time (`/films/<f>/play`, the Scenes, a lab with
 * no scene), a project card's anchor (`#point-<id>`, now `?point=<id>`), and
 * a project link to a choice's card (on Choices now). The server sends the browser on with a redirect (the browser
 * keeps the hash, which the server never sees); a page already loaded
 * replaces its entry. A scene's lab reads a bare `#<seconds>` as film time itself.
 */
export const legacyPlace = (href: string): Option.Option<string> => {
  const url = parseHref(href);
  const moved = legacyPath(url.pathname, url.searchParams);
  const at = Option.getOrElse(moved, () => `${url.pathname}${url.search}`);
  const hashKept = Option.map(moved, (to) => `${to}${url.hash}`);
  const focused = Option.flatMap(cardAnchor(url.hash), (point) => withFocus(at, point));
  const old = Option.orElse(focused, () =>
    Option.match(bareTime(url.hash), {
      onNone: () => hashKept,
      onSome: (t) =>
        Option.orElse(
          Option.liftPredicate(withFilmTime(at, t), (next) => next !== at),
          () => hashKept,
        ),
    }),
  );
  // A project link to a choice's card goes on to the card on Choices, from wherever the rest leaves it.
  return Option.orElse(choiceOffProject(Option.getOrElse(old, () => href)), () => old);
};

// ---------------------------------------------------------------------------
// The URLs a page puts in an <img>, <audio> or <video>, derived from the routes.

/** Every route's URL, built from its declaration: the one way server, page and tests write a path. */
export const labUrls = HttpApiClient.urlBuilder(LabHttpApi);

/** An image of a film's board (a try, the style's reference), by its file name. */
export const boardFileUrl = (film: string, file: string): string =>
  labUrls.board.file({ params: { film, file } });

/** A note's still. */
export const stillUrl = (film: string, name: string): string =>
  labUrls.notes.still({ params: { film, name } });

/** A studio attempt's audio, to hear it again. */
export const attemptUrl = (film: string, beat: string, file: string): string =>
  labUrls.studio.attempt({ params: { film, beat, file } });

/** A beat's staging take's audio, by the name its `Ready` gives it. */
export const stagingTakeUrl = (film: string, file: string): string =>
  labUrls.script.take({ params: { film, file } });

/** A series draft's beat's staging take's audio, by the name its `Ready` gives it. */
export const draftTakeUrl = (series: string, draft: string, file: string): string =>
  labUrls.series.take({ params: { series, draft, file } });

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

/** A still of a set's file, `w` px wide: an image as it is, a video's frame 10% in. */
export const reviewStillUrl = (ref: string, w: number): string =>
  Match.value(/\.(png|jpe?g|webp|gif|avif)$/i.test(ref)).pipe(
    Match.when(true, () => reviewFileUrl(ref)),
    Match.orElse(() => reviewFrameUrl(ref, Option.none(), w)),
  );

/** A variant of a choice point heard alone: a take's file, an attempt's. */
export const choiceAloneUrl = (film: string, point: string, variant: string): string =>
  labUrls.choices.alone({ params: { film }, query: { point, variant } });

/** The film's whole mix with a variant of a choice point in place (an m4a). */
export const choiceMixUrl = (film: string, point: string, variant: string): string =>
  labUrls.choices.mix({ params: { film }, query: { point, variant } });
