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

import { Codec, Field, Place, decodeComponent, parseHref } from '@bible/url-state';
import {
  Array as Arr,
  Duration,
  Effect,
  Match,
  Option,
  Result,
  Schema,
  SchemaAST,
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
import { BoardFile, BoardName } from './board.ts';
import { AskName, AskRecord, AsksPage, StepValues } from './ask.ts';
import { sceneOfPoint } from './point.ts';
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
import { MatchFigureUnknown, MatchPost, MatchTaken } from './match.ts';
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
  FilmVersionUnkept,
  FilmVersionUnknown,
  FreshProcessFailed,
  MediaFailed,
  NoteAnswered,
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
  HoldUnchanged,
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
  LabWrite,
  Note,
  NotePost,
  NotesFile,
  NotesWait,
  PageBuild,
  ReplyPost,
  RequestId,
  SceneCode,
  TakeWord,
} from './schema.ts';
import { Segment } from './segment.ts';
import { FilmTimeline } from './timeline-schema.ts';
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
  NoteAnswered.pipe(status(409)),
  AskUnknown.pipe(status(404)),
  SceneNotLocated.pipe(status(404)),
  FilmUnknown.pipe(status(404)),
  FilmVersionUnknown.pipe(status(404)),
  FilmVersionUnkept.pipe(status(404)),
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
  MatchFigureUnknown.pipe(status(404)),
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
  HoldUnchanged.pipe(status(422)),
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
 * A failure as a film tool prints it (`film lab look --json`, `film judge
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

/**
 * `POST /api/films/<film>/beats/move`: beat `beat` of version `version` (the
 * open one when none) moved before beat `before` (to the end when none).
 */
const BeatMovePost = Schema.Struct({
  version: Schema.optionalKey(Schema.Int),
  beat: Schema.String,
  before: Schema.optionalKey(Schema.String),
});

/**
 * `POST /api/films/<film>/beats/hold`: beat `beat`'s hold at `edge` (`lead`,
 * before its words; `tail`, after them) set to `seconds`, snapped to a tenth
 * and kept inside its floors.
 */
const BeatHoldPost = Schema.Struct({
  version: Schema.optionalKey(Schema.Int),
  beat: Schema.String,
  edge: Schema.Literals(['lead', 'tail']),
  seconds: Schema.Finite,
});

/**
 * A studio edit as it answers (a move, a hold, an Undo or a Redo of one):
 * the change it made (none when the script was already so), what it set,
 * what it says to the owner (a receipt's words), and what Undo and Redo
 * would step now. No check runs: the agents re-check what it leaves.
 */
export const StudioEdit = Schema.Struct({
  change: Schema.optionalKey(ChangeId),
  target: Schema.String,
  said: Schema.String,
  steps: Steps,
});
export type StudioEdit = typeof StudioEdit.Type;

/** A word of a take, by its index into the take's transcript (`core/talk.ts`). */
const TalkWordIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * A word of a talk's section as the lab reads it: its index
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

/** A talk's section as the lab reads it: its words from its first to its last, and its marks. */
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
const TalkMarkPost = Schema.Struct({
  section: Schema.String,
  word: TalkWordIndex,
  name: Schema.String,
});

/**
 * A beat of a film's script as the words reader reads it beside the staged
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
  /** The note taken back while it is unanswered (a receipt's Undo): answers the note as it was. */
  HttpApiEndpoint.post('withdraw', `${FILM}/notes/:id/withdraw`, {
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

/** A scene's code as the studio's Scene section reads it. */
class ScenesGroup extends HttpApiGroup.make('scenes').add(
  /** The scene file's text now, and where its cues and knobs are written and read (the studio's Scene section). */
  HttpApiEndpoint.get('code', `${FILM}/scenes/:scene/code`, {
    params: { ...film, scene: Schema.String },
    success: SceneCode,
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

/** The studio's edits of a version's script (a beat moved, a hold set), and Undo and Redo of the film's newest change, without the check. */
class EditsGroup extends HttpApiGroup.make('edits').add(
  HttpApiEndpoint.post('move', `${FILM}/beats/move`, {
    params: film,
    payload: BeatMovePost,
    success: StudioEdit,
    error: Refusals,
  }),
  HttpApiEndpoint.post('hold', `${FILM}/beats/hold`, {
    params: film,
    payload: BeatHoldPost,
    success: StudioEdit,
    error: Refusals,
  }),
  HttpApiEndpoint.post('undo', `${FILM}/edits/undo`, {
    params: film,
    payload: StepRequest,
    success: StudioEdit,
    error: Refusals,
  }),
  HttpApiEndpoint.post('redo', `${FILM}/edits/redo`, {
    params: film,
    payload: StepRequest,
    success: StudioEdit,
    error: Refusals,
  }),
) {}

/**
 * A talk's words as the lab reads them, and its edits of them: words struck
 * (Cut) or played again (Restore), and a mark set on a word (Mark here). Each write rewrites `talk.ts` by its literal, as a scene write does.
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
 * The film's script as the words reader reads it beside the staged film: each
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
const BoardBeatPost = Schema.Struct({ beat: BoardName });

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
  /** A board image, of version folder `?folder=v<n>`'s Board when given (`<film>/v<n>/board/`). */
  HttpApiEndpoint.get('file', `${FILM}/board/files/:file`, {
    params: { ...film, file: Schema.String },
    query: { folder: Schema.optionalKey(Segment) },
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
const AskSectionPost = Schema.Struct({ step: AskName, values: StepValues });
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
 * record, or with every ask on its page (the asks made in sequence, in the
 * order made), and answered as one page, its sections in order; the answers
 * move its machine and are kept, so a reload or another device opens it
 * where it was left.
 */
class AsksGroup extends HttpApiGroup.make('asks').add(
  HttpApiEndpoint.get('read', `${API}/asks/:ask`, {
    params: { ask: Schema.String },
    success: AskRecord,
    error: Refusals,
  }),
  HttpApiEndpoint.get('page', `${API}/asks/:ask/page`, {
    params: { ask: Schema.String },
    success: AsksPage,
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
 * answered by their paths. A tool's call (`film lab look`), not a page's: it
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
 * A match (`core/match.ts`): a scene's figures at one place, each drawn by
 * the look's warm page, cropped by the box its rig declares and measured
 * against its concept (`core/figure.ts`), the tables and side-by-sides
 * written under the film's `out/<film>/match/` and answered with their
 * paths. A tool's call, as a look is, with a look's guarantees: the pages'
 * build of every save made before it, a failed one `PagesBroken`.
 */
class MatchesGroup extends HttpApiGroup.make('matches').add(
  HttpApiEndpoint.post('take', `${FILM}/matches`, {
    params: film,
    payload: MatchPost,
    success: MatchTaken,
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
 * A film's timeline as the studio page draws it (`core/film-timeline.ts`,
 * the model the `timeline` tool answers too): at version `v`, else at its
 * production's open version. A version the film has not is
 * `FilmVersionUnknown`; one whose files a later version replaced in place,
 * `FilmVersionUnkept`.
 */
class TimelineGroup extends HttpApiGroup.make('timeline').add(
  HttpApiEndpoint.get('read', `${FILM}/timeline`, {
    params: film,
    query: { v: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))) },
    success: FilmTimeline,
    error: Refusals,
  }),
) {}

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
  .add(EditsGroup)
  .add(TalkGroup)
  .add(ScriptGroup)
  .add(SeriesGroup)
  .add(BoardGroup)
  .add(StudioGroup)
  .add(ReviewGroup)
  .add(ChoicesGroup)
  .add(ProjectGroup)
  .add(LooksGroup)
  .add(MatchesGroup)
  .add(ProductionsGroup)
  .add(TimelineGroup)
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
// Places. The path says what a view is about (a film, its studio, a set),
// the query how it is shown or what is selected in it (a clip, a note, a
// set's view), the hash when (`#t=`, seconds). The server
// serves a page at each place's path (`pageAt`), every link is printed by
// `Place.href` over these (`pageHref`), and each page reads and writes its
// own through `UrlState`. Old links (`/lab?film=`, `/?project=`, …) are
// rewritten to their place by `legacyPlace`, on the server as a redirect and
// on a page already loaded as a replace.

/** The studio's pages, each one HTML entry: its review and its player (the film's studio). */
export type PageName = 'review' | 'player';

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
 * A time on the hash (`#t=12.5`), in seconds from the film's start or the
 * video's (an old scene's Lab, Script or Board link held it from the
 * scene's). None opens the page at its own start. It follows the playhead at
 * most every `TIME_EVERY_MS`, and never makes a history entry.
 */
const time = Field.key(maybe(Codec.Finite), {
  default: Option.none(),
  throttle: Duration.millis(TIME_EVERY_MS),
});
const At = Field.struct({ t: time });

/** A film by its name: one path segment (a short's `/` is written `%2F`). */
const filmParams = { film: Codec.Segment };

/** A key naming something selected in a view (a cue, a note, a card): each change is a step Back walks. */
const cited = Field.key(Codec.Text, { default: '', history: 'push' });

/** A key refining how a view is shown (a pair's other side, the sound heard): no step of its own. */
const refined = Field.key(Codec.Text, { default: '' });

/**
 * The thing whose inspector is open (`?inspect=`, `useInspectorPlace`): one
 * of a set's versions. Its opening is a step Back walks; none open is the page's first,
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

/** The studio's panes beside the viewer, besides the inspector: none open (`closed`), or the Script pane. */
const STUDIO_PANES = ['closed', 'script'] as const;

/** A moment's index (`?m=`): a whole number from 0. */
const MomentIndex = Codec.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** The note an old Lab, Script or Board link had open (`?note=`), which the studio's inspector opens. */
const NoteOpen = Field.struct({ note: cited });

/** What an old Script beat link had open: the note, and its line's words selected (`?words=<a>-<b>`). */
const ScriptOpen = Field.struct({ note: cited, words: cited });

/**
 * What a Board beat's old link picked (`/films/<film>/board/<beat>?panel=&try=&note=`):
 * a panel by the mark it is held from, the try shown in it (0: its kept
 * try) and the note open, which the studio selects, shows and opens.
 */
const BoardSelection = Field.struct({
  panel: cited,
  try: Field.key(Codec.Int, { default: 0 }),
  note: cited,
});

/**
 * The film pages the studio replaced (a film's project, its Scenes, a scene
 * of them, Play, its choices, its Script, its Board and its Lab): no page is served
 * at them now. Their places are read only to send an old link on to the
 * studio (`studioPlace`) and an older one through them (`legacyPlace`).
 */
const Replaced = {
  project: Place.make({
    path: '/films/:film/project',
    params: filmParams,
    query: Field.struct({ point: cited }),
    hash: At,
  }),
  scenes: Place.make({ path: '/films/:film/scenes', params: filmParams, hash: At }),
  scene: Place.make({
    path: '/films/:film/scenes/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    hash: At,
  }),
  play: Place.make({ path: '/films/:film/play', params: filmParams, hash: At }),
  /** A film's choices, a card in focus (`?point=`): its picks arrive as asks now. */
  choices: Place.make({
    path: '/films/:film/choices',
    params: filmParams,
    query: Field.struct({ point: cited }),
    hash: At,
  }),
  /** A film's Script: the studio's Words reads a beat's words now. */
  script: Place.make({
    path: '/films/:film/script',
    params: filmParams,
    query: NoteOpen,
    hash: At,
  }),
  scriptBeat: Place.make({
    path: '/films/:film/script/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: ScriptOpen,
    hash: At,
  }),
  /** A film's Lab: sent on to the studio, whose timeline plays and edits the film. */
  lab: Place.make({ path: '/films/:film/lab', params: filmParams, query: NoteOpen, hash: At }),
  /** A scene's Lab: the studio's inspector on its beat. */
  labScene: Place.make({
    path: '/films/:film/lab/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: NoteOpen,
    hash: At,
  }),
  /** A film's Board: the studio's Board section keeps and approves a beat's panels now. */
  board: Place.make({
    path: '/films/:film/board',
    params: filmParams,
    query: NoteOpen,
    hash: At,
  }),
  boardBeat: Place.make({
    path: '/films/:film/board/:scene',
    params: { film: Codec.Segment, scene: Codec.Segment },
    query: BoardSelection,
    hash: At,
  }),
};

/**
 * Every place a page is at. Review: home `/`, a folder of renders
 * `/sets/<folder>` (its still open full size), a comparison set
 * `/sets/<folder>/<point>` (its view, pair, moment, time and still open).
 * Studio: a film's studio `/films/<film>/studio?v=&sel=#t=`, the version
 * shown, the clip selected and the playhead in film time; it took the place
 * of the film's project, its scenes, its plain preview, its choices, its
 * Script, its Board and its Lab (`Replaced`, whose links are sent on to
 * it). Render: a film's export page `/films/<film>/export`, the film staged with
 * no chrome and its handle on `window.__film` (`mountRender`), which the
 * easel opens (`film lab look`); no reviewer's view, so it holds no
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
  export: Place.make({ path: '/films/:film/export', params: filmParams }),
  /**
   * A film's studio (`lab/film-studio/`): its timeline at version `?v=` (0:
   * the production's open one), the clip selected (`?sel=beat:<id>`, a step
   * Back walks), the note open in its inspector (`?note=<id>`), the try of
   * the selected panel shown in the viewer (`?try=<n>`; 0: the kept one), the
   * words of the selected beat's line selected (`?words=<a>-<b>`), the
   * Script pane open (`?pane=script`; closed at rest), and the playhead on
   * `#t=`, film seconds.
   */
  studio: Place.make({
    path: '/films/:film/studio',
    params: filmParams,
    query: Field.struct({
      v: Field.key(Codec.Int, { default: 0, history: 'push' }),
      sel: cited,
      note: cited,
      try: Field.key(Codec.Int, { default: 0, history: 'push' }),
      words: cited,
      pane: Field.key(Codec.literals(STUDIO_PANES), { default: 'closed', history: 'push' }),
    }),
    hash: At,
  }),
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
  /**
   * An agent's ask: the page of asks it is on (`core/ask.ts`), taken to this
   * one, each at the step its run is on; a Board still open full size.
   */
  ask: Place.make({
    path: '/asks/:ask',
    params: { ask: Codec.Segment },
    query: Field.struct({ still }),
  }),
  /**
   * A page of asks, by the ask that opened it: the asks made in sequence, in
   * the order made, taken to the first still asking; a Board still open full size.
   */
  askPage: Place.make({
    path: '/asks/page/:page',
    params: { page: Codec.Segment },
    query: Field.struct({ still }),
  }),
};

/** The page each place is served by, the first that holds a path winning. */
const PAGES: ReadonlyArray<readonly [Place.Place<unknown>, AppPage]> = [
  [Places.home, 'review'],
  [Places.production, 'review'],
  [Places.folder, 'review'],
  [Places.set, 'review'],
  [Places.export, 'render'],
  [Places.studio, 'player'],
  [Places.ask, 'review'],
  [Places.askPage, 'review'],
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
  Places.export,
  Places.studio,
];

/** The film `href`'s path names (`/films/<film>/…`), if it names one. */
export const filmOfPage = (href: string): Option.Option<string> =>
  Option.firstSomeOf(
    FILM_PLACES.map((place) => Option.map(Place.decode(place, href), (v) => v.path.film)),
  );

/** No time on the hash: the page opens at its own start. */
const START = { t: Option.none<number>() };

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
  /** An agent's ask: its page, taken to it. */
  ask: (ask: string): string =>
    Place.href(Places.ask, { path: { ask }, query: { still: '' }, hash: {} }),
  /** A page of asks, by the ask that opened it: taken to the first still asking. */
  askPage: (page: string): string =>
    Place.href(Places.askPage, { path: { page }, query: { still: '' }, hash: {} }),
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
  /**
   * A film's studio at version `v` (0: the open one), with `sel` selected,
   * the note `note` open, the selected panel's try `try` shown (0: the kept
   * one), the selected beat's words `words` selected (`<a>-<b>`), the pane
   * `pane` open, at film time `t`.
   */
  studio: (
    film: string,
    {
      v = 0,
      sel = '',
      note = '',
      try: shown = 0,
      words = '',
      pane = 'closed',
    }: {
      readonly v?: number;
      readonly sel?: string;
      readonly note?: string;
      readonly try?: number;
      readonly words?: string;
      readonly pane?: (typeof STUDIO_PANES)[number];
    } = {},
    t: Option.Option<number> = Option.none(),
  ): string =>
    Place.href(Places.studio, {
      path: { film },
      query: { v, sel, note, try: shown, words, pane },
      hash: timeOf(t),
    }),
  /** A film's export page: the render page, staged for the easel's stills. */
  export: (film: string): string =>
    Place.href(Places.export, { path: { film }, query: {}, hash: {} }),
};

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

/**
 * The studio's place for an old Lab link's `sel=<cue|knob>:<scene>:<name>` on
 * `film`: the scene's beat selected (the studio selects no cue or knob), else
 * the film's studio.
 */
const studioOfSelection = (film: string, sel: Option.Option<string>): string =>
  Option.getOrElse(
    Option.flatMap(sel, (raw) => {
      const [kind = '', scene = '', ...rest] = raw.split(':');
      const name = rest.join(':');
      if ((kind !== 'cue' && kind !== 'knob') || name === '') return Option.none();
      return Option.map(asSegment(scene), (s) => pageHref.studio(film, { sel: beatSelection(s) }));
    }),
    () => pageHref.studio(film),
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
    Option.map(Place.decode(Replaced.play, pathname), (value) => value.path.film),
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
  if (pathname === '/lab')
    return Option.some(
      Option.match(film, {
        onNone: () => pageHref.home(),
        onSome: (f) => studioOfSelection(f, param(query, 'sel')),
      }),
    );
  // A player's or the root's film, with `&lookbook` or `&lab` or neither: the film's studio.
  if (pathname === '/player')
    return Option.some(
      Option.match(film, { onNone: () => pageHref.home(), onSome: (f) => pageHref.studio(f) }),
    );
  if (pathname !== '/') return Option.none();
  const project = segmentParam(query, 'project');
  if (Option.isSome(project)) return Option.some(pageHref.studio(project.value));
  if (Option.isSome(film)) return Option.some(pageHref.studio(film.value));
  return Option.flatMap(segmentParam(query, 'folder'), (folder) =>
    Option.some(
      Option.match(segmentParam(query, 'set'), {
        onNone: () => pageHref.folder(folder),
        onSome: (point) => setOfQuery(folder, point, query),
      }),
    ),
  );
};

/** A path's segments, as written: `/films/rbf/` is `films`, `rbf`. */
const segmentsOf = (pathname: string): ReadonlyArray<string> =>
  pathname.split('/').filter((segment) => segment !== '');

/** The segments of every path a place is at: the pages served, and the pages the studio replaced. */
const PATTERNS: ReadonlyArray<ReadonlyArray<string>> = [
  ...PAGES.map(([place]) => place.pattern),
  ...Object.values(Replaced).map((place) => place.pattern),
].map(segmentsOf);

/** Whether `segments` begin `pattern` (a `:param` takes any one segment). */
const begins = (pattern: ReadonlyArray<string>, segments: ReadonlyArray<string>): boolean =>
  segments.every((segment, i) =>
    Option.exists(Arr.get(pattern, i), (part) => part.startsWith(':') || part === segment),
  );

/** Whether a path is some place's, the pages the studio replaced among them. */
const isPlaced = (segments: ReadonlyArray<string>): boolean =>
  PATTERNS.some((pattern) => pattern.length === segments.length && begins(pattern, segments));

/** Whether a path names the first segments of some place's, and is no place of its own. */
const isParent = (segments: ReadonlyArray<string>): boolean =>
  segments.length > 0 &&
  !isPlaced(segments) &&
  PATTERNS.some((pattern) => pattern.length > segments.length && begins(pattern, segments));

/** A film's own path (`/films/<film>`), no page's: the parent of its studio. */
const filmParent = Place.make({ path: '/films/:film', params: filmParams });

/**
 * The page a parent path opens (a hand-trimmed link): a film's, its studio;
 * any other, home. None when the path is no place's parent.
 */
const parentPlace = (pathname: string): Option.Option<string> =>
  Option.orElse(
    Option.map(Place.decode(filmParent, pathname), (v) => pageHref.studio(v.path.film)),
    () => Option.map(Option.liftPredicate(segmentsOf(pathname), isParent), () => pageHref.home()),
  );

/**
 * The place a path off every place's names, if it names one: a trailing
 * slash dropped (the query kept), a parent path its nearest page
 * (`parentPlace`).
 */
const trimmedPath = (pathname: string, search: string): Option.Option<string> => {
  // Every trailing slash but the root's own.
  const at = pathname.replace(/(.)\/+$/, '$1');
  return Option.orElse(parentPlace(at), () =>
    Option.map(
      Option.liftPredicate(at, (path) => path !== pathname && isPlaced(segmentsOf(path))),
      (path) => `${path}${search}`,
    ),
  );
};

/**
 * `href` with its film time on the hash as `#t=`, where its place reads film
 * time (the player, the Scenes' tape with a scene selected or not, a film's
 * Lab).
 */
const withFilmTime = (href: string, t: number): string => {
  const hash = timeOf(Option.some(t));
  return Option.getOrElse(
    Option.firstSomeOf([
      Option.map(Place.decode(Replaced.play, href), (v) =>
        Place.href(Replaced.play, { ...v, hash }),
      ),
      Option.map(Place.decode(Replaced.scenes, href), (v) =>
        Place.href(Replaced.scenes, { ...v, hash }),
      ),
      Option.map(Place.decode(Replaced.scene, href), (v) =>
        Place.href(Replaced.scene, { ...v, hash }),
      ),
      Option.map(Place.decode(Places.studio, href), (v) =>
        Place.href(Places.studio, { ...v, hash }),
      ),
      Option.map(Place.decode(Replaced.lab, href), (v) => Place.href(Replaced.lab, { ...v, hash })),
    ]),
    () => href,
  );
};

/** The card an old project anchor (`#point-<id>`) names: none when its escape is broken. */
const cardAnchor = (hash: string): Option.Option<string> =>
  Option.flatMap(
    Option.liftPredicate(hash, (h) => h.startsWith('#point-') && h.length > '#point-'.length),
    (h) => Result.getSuccess(decodeComponent(h.slice('#point-'.length))),
  );

/** `href`, when it is a project, with the card of `point` in focus. */
const withFocus = (href: string, point: string): Option.Option<string> =>
  Option.map(Place.decode(Replaced.project, href), (value) =>
    Place.href(Replaced.project, { ...value, query: { ...value.query, point }, hash: START }),
  );

/**
 * The place an old link names, if `href` is one: `/lab?film=<f>[&sel=…]`,
 * `/player?film=<f>[&lookbook|&lab]`, `/?project=<f>`,
 * `/?film=<f>[&lookbook|&lab]`, `/?folder=<ref>[&set=<point>…]`, a render
 * link (`/films/<f>/play?export`, `/?film=<f>&export`, now the film's export
 * page `/films/<f>/export`), a bare
 * `#<seconds>` on a place that reads film time (`/films/<f>/play`, the Scenes, a film's
 * Lab), a project card's anchor (`#point-<id>`, now `?point=<id>`), a
 * path with a trailing slash (`/films/<f>/studio/`, the slash dropped) and a
 * parent path (`/films/<f>`, its studio; `/films`, `/series/<s>`, `/sets`,
 * home).
 * The server sends the browser on with a redirect (the browser keeps the hash, which the server never sees); a page already loaded
 * replaces its entry.
 */
export const legacyPlace = (href: string): Option.Option<string> => {
  const url = parseHref(href);
  const moved = Option.orElse(legacyPath(url.pathname, url.searchParams), () =>
    trimmedPath(url.pathname, url.search),
  );
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
  return old;
};

/** What a studio selection of a beat starts with. */
const BEAT_SELECTED = 'beat:';

/** The studio's selection of beat `beat` (`?sel=beat:<id>`). */
export const beatSelection = (beat: string): string => `${BEAT_SELECTED}${beat}`;

/** The beat a studio selection names (`beat:<id>`), if it names one. */
export const selectedBeat = (sel: string): Option.Option<string> =>
  Option.filter(
    Option.map(
      Option.liftPredicate(sel, (s) => s.startsWith(BEAT_SELECTED)),
      (s) => s.slice(BEAT_SELECTED.length),
    ),
    (id) => id !== '',
  );

/** What starts a studio selection of a Board panel. */
const PANEL_SELECTED = 'panel:';

/** The studio's selection of Board panel `panel` (`?sel=panel:<beat>.<mark>`): its beat's inspector, its Board open. */
export const panelSelection = (panel: string): string => `${PANEL_SELECTED}${panel}`;

/** The Board panel a studio selection names (`panel:<id>`), if it names one. */
export const selectedPanel = (sel: string): Option.Option<string> =>
  Option.filter(
    Option.map(
      Option.liftPredicate(sel, (s) => s.startsWith(PANEL_SELECTED)),
      (s) => s.slice(PANEL_SELECTED.length),
    ),
    (id) => id !== '',
  );

/**
 * What an old page's hash holds: film seconds, which the studio reads as
 * its own (`Film`), or seconds into the page's beat (`InBeat`), which the
 * studio cannot place before its timeline is read.
 */
type ReplacedTime =
  | { readonly _tag: 'Film'; readonly t: Option.Option<number> }
  | { readonly _tag: 'InBeat' };

/**
 * A film page the studio replaced, read as the studio's film, what it
 * selects (`beatSelection`, `panelSelection`), the note it opens, the try
 * of the selected panel it shows (0: the kept one) and the time it is at.
 */
interface Replaced {
  readonly film: string;
  readonly sel: Option.Option<string>;
  readonly note: string;
  readonly try: number;
  readonly words: string;
  readonly time: ReplacedTime;
}

/** Film time `t` on the studio's clock. */
const filmTime = (t: Option.Option<number>): ReplacedTime => ({ _tag: 'Film', t });

/** Time in the beat: the studio opens at the beat's start (a panel's mark). */
const IN_BEAT: ReplacedTime = { _tag: 'InBeat' };

/** What an old page selected and opened: nothing beyond `sel` unless named. */
const replaced = (
  film: string,
  sel: Option.Option<string>,
  time: ReplacedTime,
  open: { readonly note?: string; readonly try?: number; readonly words?: string } = {},
): Replaced => ({
  film,
  sel,
  note: open.note ?? '',
  try: open.try ?? 0,
  words: open.words ?? '',
  time,
});

/** A page whose `#t=` is film time, on its film, no beat selected. */
const filmTimed =
  <Q>(
    place: Place.Place<{
      readonly path: { readonly film: string };
      readonly query: Q;
      readonly hash: { readonly t: Option.Option<number> };
    }>,
  ) =>
  (href: string): Option.Option<Replaced> =>
    Option.map(Place.decode(place, href), (v) =>
      replaced(v.path.film, Option.none(), filmTime(v.hash.t)),
    );

/** The beat a choice point's scene render names (`render:scenes:<scene>`), selected. */
const pointSelection = (point: string): Option.Option<string> =>
  Option.map(sceneOfPoint(point), beatSelection);

/**
 * The film pages the studio replaced, each read as what it showed. A scene
 * of the tape's `#t=` is film time, as the studio's is: it is kept.
 */
const REPLACED: ReadonlyArray<(href: string) => Option.Option<Replaced>> = [
  filmTimed(Replaced.play),
  filmTimed(Replaced.scenes),
  (href) =>
    Option.map(Place.decode(Replaced.scene, href), (v) =>
      replaced(v.path.film, Option.some(beatSelection(v.path.scene)), filmTime(v.hash.t)),
    ),
  // A scene's render in focus names its scene, on the project and on the choices alike.
  (href) =>
    Option.map(Place.decode(Replaced.project, href), (v) =>
      replaced(v.path.film, pointSelection(v.query.point), filmTime(Option.none())),
    ),
  (href) =>
    Option.map(Place.decode(Replaced.choices, href), (v) =>
      replaced(v.path.film, pointSelection(v.query.point), filmTime(v.hash.t)),
    ),
  // The Script's and the Board's whole film: `#t=` is film time on both (each plays the film's
  // narration), and the note open is the studio's to open.
  (href) =>
    Option.map(Place.decode(Replaced.script, href), (v) =>
      replaced(v.path.film, Option.none(), filmTime(v.hash.t), { note: v.query.note }),
    ),
  (href) =>
    Option.map(Place.decode(Replaced.board, href), (v) =>
      replaced(v.path.film, Option.none(), filmTime(v.hash.t), { note: v.query.note }),
    ),
  // The film's Lab: `#t=` is film time, as the studio's is; the note open kept.
  (href) =>
    Option.map(Place.decode(Replaced.lab, href), (v) =>
      replaced(v.path.film, Option.none(), filmTime(v.hash.t), { note: v.query.note }),
    ),
  // A scene's Lab: its beat selected, the note open kept. Its `#t=` is time in the scene.
  (href) =>
    Option.map(Place.decode(Replaced.labScene, href), (v) =>
      replaced(v.path.film, Option.some(beatSelection(v.path.scene)), IN_BEAT, {
        note: v.query.note,
      }),
    ),
  // A beat's page: its beat selected, its panel and the try shown in it when one is in focus, the
  // note open kept. Its `#t=` is time in the beat.
  (href) =>
    Option.map(Place.decode(Replaced.scriptBeat, href), (v) =>
      replaced(v.path.film, Option.some(beatSelection(v.path.scene)), IN_BEAT, {
        note: v.query.note,
        words: v.query.words,
      }),
    ),
  (href) =>
    Option.map(Place.decode(Replaced.boardBeat, href), (v) =>
      Option.match(
        Option.liftPredicate(v.query.panel, (p) => p !== ''),
        {
          onNone: () =>
            replaced(v.path.film, Option.some(beatSelection(v.path.scene)), IN_BEAT, {
              note: v.query.note,
            }),
          onSome: (panel) =>
            replaced(
              v.path.film,
              Option.some(panelSelection(`${v.path.scene}.${panel}`)),
              IN_BEAT,
              { note: v.query.note, try: v.query.try },
            ),
        },
      ),
    ),
];

/**
 * The fragment a redirect's Location ends with when the old link's hash is
 * not the studio's time: an empty one, which the browser keeps instead of
 * carrying the old hash across (it carries one only to a Location that names
 * none).
 */
const NO_TIME = '#';

/**
 * The studio's place for a film page it replaced (`/films/<f>/play`,
 * `/scenes[/<scene>]`, `/project[?point=render:scenes:<scene>]`,
 * `/choices[?point=]`, `/script[/<beat>][?note=]`,
 * `/board[/<beat>?panel=<mark>&try=<n>][&note=]`, `/lab[/<scene>][?note=]`): the same film, its beat
 * selected (`?sel=beat:<id>`, or its panel `?sel=panel:<beat>.<mark>` with
 * the try shown, `?try=<n>`), the note open (`?note=<id>`), and its film time
 * kept. A beat's Script, Board or Lab held time in the beat on its hash: its
 * place ends in an empty fragment (`NO_TIME`), so the studio opens at the
 * beat's start, or at the panel's mark. The lab's server sends a browser on
 * with a redirect (`servedPlace`).
 */
export const studioPlace = (href: string): Option.Option<string> =>
  Option.map(Option.firstSomeOf(REPLACED.map((read) => read(href))), (at) => {
    const open = {
      sel: Option.getOrElse(at.sel, () => ''),
      note: at.note,
      try: at.try,
      words: at.words,
    };
    return Match.value(at.time).pipe(
      Match.tagsExhaustive({
        Film: ({ t }) => pageHref.studio(at.film, open, t),
        InBeat: () => `${pageHref.studio(at.film, open)}${NO_TIME}`,
      }),
    );
  });

/**
 * Where the lab's server sends a link it does not serve as asked: an old
 * link to its place (`legacyPlace`), and a page the studio replaced to the
 * studio (`studioPlace`), the old link's place first.
 */
export const servedPlace = (href: string): Option.Option<string> =>
  Option.match(legacyPlace(href), {
    onNone: () => studioPlace(href),
    onSome: (to) => Option.orElse(studioPlace(to), () => Option.some(to)),
  });

// ---------------------------------------------------------------------------
// The URLs a page puts in an <img>, <audio> or <video>, derived from the routes.

/** Every route's URL, built from its declaration: the one way server, page and tests write a path. */
export const labUrls = HttpApiClient.urlBuilder(LabHttpApi);

/** An image of a film's board (a try, the style's reference), by its file name. */
export const boardFileUrl = (film: string, file: string, folder?: Segment): string =>
  labUrls.board.file({
    params: { film, file },
    query: Option.match(Option.fromUndefinedOr(folder), {
      onNone: () => ({}),
      onSome: (f) => ({ folder: f }),
    }),
  });

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
