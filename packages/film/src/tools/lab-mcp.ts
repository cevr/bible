// The lab as an MCP server, for agents: the running lab answers MCP at
// `/mcp` (Streamable HTTP, Effect's `McpServer`), so an agent reads what
// the owner said and kept in the lab, acts on it, and hears of each change
// as it happens, instead of reading files and handing links back and forth.
//
// - Reads: the films and sets (`overview`, `sets`, `set`), a film's notes
//   (`notes`), its board (`board`), a project folder's catalogue
//   (`catalogue`), and what changed past a cursor (`changes`), which also
//   waits for the next change: the event feed (`LabEvents`) that every
//   session, a subagent's too, can read.
// - Writes, each through the store the page and the CLI write through
//   (`NotesStore`, `BoardStore`, `RenderCatalogue`, `ContentStore`), so
//   there is no second write path: a reply or a note marked done
//   (`reply`, `resolve`), a tweak asked of a panel (`request_tweak`), a set
//   published (`publish_set`), a render recorded (`record_render`).
// - Asks: a decision page an agent composes from the lab's primitives as a
//   small machine (`ask`), answered by the owner on any device, each step's
//   answers heard as `ask.step` changes; read (`ask_read`, `asks`) and closed
//   (`close_ask`), what closed it (answers, or withdrawn) filed on its
//   production's timeline once by its id
//   (`AskStore`, `ProductionStore`; `core/ask.ts`).
// - The easel's tools (`easel-mcp.ts`): a scene looked at as its files
//   stand, its stills answered as images (`look`), the film's clock
//   (`cues`), scenes checked as drawn (`check`), and the film's journal read
//   and noted (`journal`, `journal_note`), so any agent paints a scene
//   through the lab.
// - Resources (`lab://…`) say the same reads for a client that attaches
//   them; the `inbox` prompt opens a session on what waits.
//
// The lab is reached on loopback and from the owner's phone over the
// tailnet (the lab listens on that address itself), and nowhere else, so
// `/mcp` asks no token (owner, 2026-10-14: secure by obscurity). The lab's
// gate (`api-server.ts`) runs first, as for any path, and Effect's server
// refuses a request with a foreign `Origin`.

import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Record,
  Result,
  Schema,
  Struct,
} from 'effect';
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from 'effect/ai';
import { pageHref } from '../core/api.ts';
import {
  Ask,
  AskAnswer,
  AskBlock,
  type AskRecord,
  answeredToEnd,
  answersLine,
  askStatus,
  givenAnswers,
  oneQuestion,
} from '../core/ask.ts';
import {
  type OwnerWord,
  ProductionId,
  Said,
  setNamed,
  setPathOf,
  versionAt,
  withAskSaid,
} from '../core/production.ts';
import { type BoardFile, BoardStyle, PANEL_START, Panel, panelById } from '../core/board.ts';
import { Catalogue, Render } from '../core/catalogue.ts';
import { LabLinks, boardPath, gist, linksAt, notePath } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import { ReviewManifest, ReviewManifestJson } from '../core/review.ts';
import { Note, type NoteDraft, NoteStatus, repoJson } from '../core/schema.ts';
import { AskStore } from './ask-store.ts';
import { BoardStore } from './board-store.ts';
import { CATALOGUE_FILE, RenderCatalogue } from './catalogue.ts';
import { ContentStore, type Manifest, writeWholeWith } from './content-store.ts';
import type { Easel } from './easel.ts';
import { EASEL_INSTRUCTIONS, easelMcp } from './easel-mcp.ts';
import { logged } from './mcp-calls.ts';
import { FilmFolder, type FilmName, filmNamed, filmsOut } from './film-repo.ts';
import type { FreshFilm } from './fresh-film.ts';
import { LabChanges, LabEvents, reviewFolders } from './lab-events.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { Review, refOf, pathOf } from './review.ts';

/** Where the lab answers MCP. */
export const MCP_PATH = '/mcp';

/** The longest a `changes` call waits for a change, in seconds: well inside the lab's idle limit. */
const MAX_WAIT_S = 120;

/** A tool's refusal, said in words the agent reads. */
class LabRefused extends Schema.TaggedError<LabRefused>()('LabRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** Any failure of a tool's work, as the tool answers it. */
const refused = <A, R>(self: Effect.Effect<A, { readonly message: string }, R>) =>
  Effect.mapError(self, (error) => LabRefused.make({ reason: error.message }));

// ---------------------------------------------------------------------------
// What the tools answer

const FilmParam = Schema.Struct({
  film: Schema.String.annotate({ description: 'The film, by name (see `overview`).' }),
});

/** A note as an agent reads it: the record, its page and its still on disk. */
const NoteRead = Schema.Struct({
  ...Note.fields,
  /** The lab page it is on. */
  links: LabLinks,
  /** Its still, a PNG on this machine. */
  stillFile: Schema.String,
});

const NotesRead = Schema.Struct({
  film: Schema.String,
  /** The note log's last change: `film notes --watch` waits past it. */
  seq: Schema.Int,
  notes: Schema.Array(NoteRead),
});

const TryRead = Schema.Struct({
  n: Schema.Int,
  /** The image, on this machine. */
  file: Schema.String,
  made: Schema.String,
  note: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  at: Schema.String,
});

const PanelRead = Schema.Struct({
  ...Struct.omit(Panel.fields, ['tries']),
  tries: Schema.Array(TryRead),
  links: LabLinks,
});

const BoardRead = Schema.Struct({
  film: Schema.String,
  style: Schema.optionalKey(Schema.Struct(Struct.pick(BoardStyle.fields, ['id', 'name']))),
  panels: Schema.Array(PanelRead),
  approvals: Schema.Array(
    Schema.Struct({
      beat: Schema.String,
      kept: Schema.Array(Schema.Struct({ panel: Schema.String, try: Schema.Int })),
      at: Schema.String,
    }),
  ),
});

const SetRead = Schema.Struct({
  /** Its ref: what `set`, `catalogue` and the lab's `/sets/<ref>` name it by. */
  set: Schema.String,
  kind: Schema.Literals(['montage', 'project']),
  title: Schema.optionalKey(Schema.String),
  links: LabLinks,
  /** Where it is on this machine. */
  dir: Schema.String,
});

const FilmRead = Schema.Struct({
  film: Schema.String,
  links: LabLinks,
  notes: Schema.Struct({ open: Schema.Int, replied: Schema.Int, tweaks: Schema.Int }),
  board: Schema.Struct({
    panels: Schema.Int,
    kept: Schema.Int,
    beatsApproved: Schema.Int,
  }),
});

const OverviewRead = Schema.Struct({
  /** The lab's address as the owner opens it. */
  lab: LabLinks,
  /** The change feed's cursor now: hand it to `changes`. */
  cursor: Schema.String,
  films: Schema.Array(FilmRead),
  sets: Schema.Array(SetRead),
});

const CatalogueRead = Schema.Struct({
  set: Schema.String,
  links: LabLinks,
  catalogue: Catalogue,
});

const SetManifestRead = Schema.Struct({
  set: Schema.String,
  links: LabLinks,
  dir: Schema.String,
  manifest: ReviewManifest,
});

const NoteWritten = Schema.Struct({ note: NoteRead });

/** A file put into a set: from a path on this machine to a path in the set's folder. */
const SetFile = Schema.Struct({
  from: Schema.String.annotate({ description: 'An absolute path on this machine.' }),
  to: Schema.String.annotate({
    description:
      'Where it goes in the set, relative (`images/1-k1.png`); the file name when left out.',
  }).pipe(Schema.optionalKey),
});

/**
 * What a publish says of the manifest, as `review.json` writes it: each key
 * given replaces the one there; one left out is kept, a key this lab does
 * not know too. The whole is checked as the review reads it.
 */
const ManifestPatch = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  blurb: Schema.optionalKey(Schema.String),
  docs: Schema.optionalKey(Schema.Array(Schema.String)),
  images: Schema.optionalKey(Schema.Array(Schema.String)),
  videos: Schema.optionalKey(Schema.Array(Schema.String)),
  downloads: Schema.optionalKey(Schema.Array(Schema.String)),
  sets: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Json).annotate({
      description:
        'Comparison sets by clip: `{ title?, order?, start?, moments?, variants: { <id>: { label?, tag?, verdict?, notes?, file? } } }`; a variant with no `file` is `<clip>.<id>.share.mp4` or `<clip>.<id>.mp4` beside it.',
    }),
  ),
});

/** `review.json` as the publish reads and writes it: its keys as they are, two-space JSON. */
const ManifestJson = repoJson(Schema.Record(Schema.String, Schema.Json));

/** A set's folder name: one segment, as the dated sets are (`storyboard-2026-10-14`). */
const SetName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/, {
    message: 'a folder name of lower case, digits, `.`, `_` and `-`',
  }),
);

/** An ask as an agent reads it: where its run is and what the owner answered, typed. */
const AskRead = Schema.Struct({
  ask: Schema.String,
  title: Schema.String,
  by: Schema.String,
  status: Schema.Literals(['asking', 'answered', 'closed']),
  /** The step the run is on while it asks, or the end it reached. */
  step: Schema.optionalKey(Schema.String),
  /** Every answer so far, by the name of the block that asked it. */
  answers: Schema.Record(Schema.String, AskAnswer),
  /** Each step answered, in order, with when. */
  answered: Schema.Array(Schema.Struct({ step: Schema.String, at: Schema.String })),
  /** Why it was closed, once it is. */
  closed: Schema.optionalKey(Schema.String),
  deadline: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  point: Schema.optionalKey(Schema.String),
  links: LabLinks,
});

/** The files a set may carry: what the review shows (images, videos, docs, captions) or offers to download. */
const SET_FILE = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4a|mp3|wav|vtt|md|txt|json|pdf|zip)$/i;

// ---------------------------------------------------------------------------
// The tools

const Overview = Tool.make('overview', {
  description:
    "The lab now: every film (its open notes, tweaks asked, its board's panels kept and beats approved), every set, the lab's address, and the change feed's cursor to hand to `changes`. Start here.",
  success: OverviewRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const Changes = Tool.make('changes', {
  description: `What changed in the lab past \`since\` (a cursor from \`overview\` or an earlier \`changes\`): notes, replies and notes done, tweaks asked, tries kept and beats approved or withdrawn on a board, comments, approvals and withdrawals on renders, renders recorded, sets published or updated, and each step of an ask answered (\`ask.step\`, its answers typed), an ask answered to its end (\`ask.answered\`) or closed. Each change names its film, panel, render or set, its words, and its lab link. With \`wait\` (seconds, at most ${MAX_WAIT_S}) it answers as soon as there is one, else with none when the time is up: call it again with the cursor it answers to keep listening. With no \`since\`, it answers no changes and the cursor now. \`reset\` means the cursor was from an earlier run of the lab: the changes are all this run kept.`,
  parameters: Schema.Struct({
    since: Schema.optionalKey(Schema.String),
    wait: Schema.optionalKey(
      Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: MAX_WAIT_S })),
    ),
  }),
  success: LabChanges,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const Notes = Tool.make('notes', {
  description:
    "A film's notes: what the owner wrote on its frames, a line's words or a board panel, each with its thread, its status (open, replied, resolved), its lab link and its still on disk. `status: unresolved` (the default) lists what waits; `all` lists every note.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    status: Schema.optionalKey(Schema.Literals(['unresolved', 'all', ...NoteStatus.literals])),
  }),
  success: NotesRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const Board = Tool.make('board', {
  description:
    "A film's storyboard: each panel (`<beat>.<mark>`), its tries (the image on disk, how it was made, the note a tweak answers), the try kept and why, and the beats approved. `beat` narrows it to one beat. Prompts are left out.",
  parameters: Schema.Struct({ ...FilmParam.fields, beat: Schema.optionalKey(Schema.String) }),
  success: BoardRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const CatalogueTool = Tool.make('catalogue', {
  description:
    "A project folder's render catalogue: its renders, and the owner's approvals and comments on them. Name the folder by `set` (a ref from `sets`), or a film's own by `film`.",
  parameters: Schema.Struct({
    film: Schema.optionalKey(Schema.String),
    set: Schema.optionalKey(Schema.String),
  }),
  success: CatalogueRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const Sets = Tool.make('sets', {
  description:
    'Every set the lab lists, by ref: montages (a `review.json`) and project folders (a `catalogue.json`), each with its title, lab link and folder.',
  success: Schema.Struct({ sets: Schema.Array(SetRead) }),
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const SetTool = Tool.make('set', {
  description: "A montage set's `review.json`, its lab link and its folder.",
  parameters: Schema.Struct({ set: Schema.String }),
  success: SetManifestRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const Reply = Tool.make('reply', {
  description:
    "Reply in a note's thread, as the agent: the note becomes `replied` until the owner answers or it is marked done. Say what you did and where to look.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    note: Schema.String.annotate({ description: 'The note (`n12`).' }),
    text: Schema.String.check(Schema.isNonEmpty()),
  }),
  success: NoteWritten,
  failure: LabRefused,
});

const Resolve = Tool.make('resolve', {
  description: 'Mark a note done (resolved), once what it asked is made.',
  parameters: Schema.Struct({ ...FilmParam.fields, note: Schema.String }),
  success: NoteWritten,
  failure: LabRefused,
}).annotate(Tool.Idempotent, true);

const RequestTweak = Tool.make('request_tweak', {
  description:
    "Ask for a board panel to be made again, as a tweak note on it (what `film board tweak <film> <note>` acts on), its still the try it starts from: `try`, else the kept one, else the newest. Use it to put the owner's word from chat onto the board. The note sits at its beat's start in the Lab and on its panel on the Board.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    panel: Schema.String.annotate({ description: 'The panel (`<beat>.<mark>`).' }),
    text: Schema.String.check(Schema.isNonEmpty()),
    try: Schema.optionalKey(Schema.Int),
  }),
  success: NoteWritten,
  failure: LabRefused,
});

const PublishSet = Tool.make('publish_set', {
  description:
    "Publish a set into the lab, or update one: its folder `name` in the lab's own `out/`, the files copied in (each `from` an absolute path, `to` its place in the folder), and its `review.json` written with the keys given (each replaces the one there; a key left out is kept). List each file the set shows under `images`, `videos`, `docs`, `downloads` or a comparison set's variants, by its path in the folder. Answers the set's ref and link: the owner sees it at once.",
  parameters: Schema.Struct({
    name: SetName,
    files: Schema.optionalKey(Schema.Array(SetFile)),
    manifest: ManifestPatch,
  }),
  success: SetManifestRead,
  failure: LabRefused,
});

const RecordRender = Tool.make('record_render', {
  description:
    "Record a render in a film's catalogue (its project folder, `out/<film>`), in place of the one before it at the same address and variant, so the review lists it. `film render` records its own; use this for a render made another way. Every file it names must be in the project folder, named relative to it.",
  parameters: Schema.Struct({
    film: Schema.String,
    render: Schema.Struct(Struct.omit(Render.fields, ['at'])),
  }),
  success: Schema.Struct({ set: Schema.String, links: LabLinks }),
  failure: LabRefused,
});

export const AskTool = Tool.make('ask', {
  description: [
    "Ask the owner to review something and decide, on one scrolling page made for it: answered on the laptop or the phone, the answers typed. A guided review has one section per piece of material, in the flow's order (script → concept → Board → voice → animatic → Rive scenes → sound → render → shorts), each section the material itself first, then its questions; one Send under them all. Give `blocks` for one section, or `machine` for several: `{start, steps}`, each step a section (`title`, its heading, e.g. 'The Board'; `blocks`; then `next`: `[{to, when?: {answer, is: [values]}}, …, {to}]`, the first whose `when` holds, the last unguarded) or an end (`{end: true, text?}`). Every section the owner's answers reach shows on the page; a guarded one appears once its choice is made.",
    "Show the material in place, by reference, never prose that points elsewhere: `{kind: 'script', film}` or `{kind: 'script', series, draft}` (the Script reader, its staging takes playable and its delivery marks editable in place; `beats` for some), `{kind: 'board', film, panels?}` (the Board's panels, each with its kept try), `{kind: 'video', ref, at?}` (a set's or a render's video in the review's player, from `at` seconds), `{kind: 'audio', film, beat, attempt?}` (a recorded take, the kept one unless named), `{kind: 'document', ref}` (a set's Markdown). A script under review is a `script` block, never a `document` of its Markdown, and an ask shows one script (ask about the next in an ask of its own). A `ref` is a file as `sets` lists it (`<root>/<folder>/<file>`). Each is found when the ask is made; one the lab cannot show is refused, named. Other blocks: a heading, prose (context only), an image (`{src}`, a lab URL `/api/…`, or `{board: {film, panel, try}}`), a choose, a free_text; each question names its answer by `id`. The machine is checked before anything is kept (every step reachable, no loops, guards on the step's own choices, every material found, one script, one recommendation per choose), and a refusal lists every problem.",
    'Ask with a `choose` (the cheap answer: the owner taps one) and mark your recommendation: `recommended: true` on exactly one option (a choose of two or more without one is refused); the page lists it first and marks it; say on it `why` (what makes it the one, said under the options; only the recommended option takes a `why`). Add an optional `free_text` for anything else rather than asking for words. A choose is always answered. A free_text is optional: the page marks it so (write no "(optional)" in its label), and left empty it is answered `{kind: \'skipped\'}`; `required: true` makes the owner write, and only a step with no choose may ask it.',
    'Say `why` (what the answer decides) and `by` (who you are); a `deadline` (ISO time) after which it takes no answer; `production` (and the `set` ref it is about, and the `point`, its choice) to file it on that timeline: it waits there until closed (or, with a `point`, a pick there).',
    'Answers its links (`local`, `phone`, `public`): hand the owner one. Each section the owner sends is an `ask.step` change on `changes` (its answers typed), and `ask.answered` once the end is reached; read it with `ask_read`, and `close_ask` it once acted on.',
  ].join(' '),
  parameters: Schema.Struct({
    title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
    why: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)),
    by: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
    film: Schema.optionalKey(Schema.String),
    deadline: Schema.optionalKey(Schema.String),
    production: Schema.optionalKey(ProductionId),
    set: Schema.optionalKey(Schema.String),
    /** The choice in that set it is about (a point id): a pick there answers it too. */
    point: Schema.optionalKey(Schema.String),
    blocks: Schema.optionalKey(Schema.Array(AskBlock)),
    /** The words the one page ends on, for `blocks`. */
    thanks: Schema.optionalKey(Schema.String),
    machine: Schema.optionalKey(Ask),
  }),
  success: AskRead,
  failure: LabRefused,
});

const AskReadTool = Tool.make('ask_read', {
  description:
    "An ask: where its run is, every answer so far (typed: a choose's value and label, a free_text's words, `skipped` for an optional one left empty), each step answered, and its links.",
  parameters: Schema.Struct({ ask: Schema.String }),
  success: AskRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const AsksTool = Tool.make('asks', {
  description:
    'Every ask, the newest first: `status` narrows them (`asking`: what waits on the owner).',
  parameters: Schema.Struct({
    status: Schema.optionalKey(Schema.Literals(['asking', 'answered', 'closed'])),
  }),
  success: Schema.Struct({ asks: Schema.Array(AskRead) }),
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const CloseAsk = Tool.make('close_ask', {
  description:
    "Close an ask, saying `why` (acted on, withdrawn): it takes no more answers and keeps what it has. With a production, it is filed on its timeline once: answered, as the owner's decision; withdrawn, as a note. Closing again with the same `why` answers it as it is (and files what a failed filing left out).",
  parameters: Schema.Struct({
    ask: Schema.String,
    why: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)),
  }),
  success: AskRead,
  failure: LabRefused,
}).annotate(Tool.Idempotent, true);

/**
 * What the owner said in chat, as `decide` and `note` file it: plainly, in
 * his own words (required, never blank: the words are what shows he said
 * it), who heard it, and what it is about.
 */
const OwnerWordParams = Schema.Struct({
  production: ProductionId.annotate({
    description:
      "The production, by name: a film's, or a track such as `look` (`film production list` names them). It must keep a ledger",
  }),
  text: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)).annotate({
    description: 'What the owner said, plainly, in a line',
  }),
  quote: Schema.String.check(
    Schema.makeFilter(
      (quote) =>
        quote.trim().length > 0 ||
        "the owner's own words, verbatim from the chat: a word filed without them is refused",
    ),
    Schema.isMaxLength(4000),
  ).annotate({
    description: "The owner's own words that said it, verbatim from the chat: required",
  }),
  by: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)).annotate({
    description: 'Who files it: your name',
  }),
  set: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The set it is about: its ref, as `sets` lists it, or its folder under its root, as the timeline names it',
    }),
  ),
  point: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The choice in that set it is about, by its id (e.g. render:cold)',
    }),
  ),
  variant: Schema.optionalKey(
    Schema.String.annotate({ description: 'The variant of that choice the owner chose' }),
  ),
});

/** What `decide` and `note` answer: the word as filed, the version it landed in, and the timeline's link there. */
const WordFiled = Schema.Struct({
  production: Schema.String,
  version: Schema.Int,
  said: Said,
  links: LabLinks,
});

const DecideTool = Tool.make('decide', {
  description:
    "File a decision the owner has already made in chat on a production's timeline, as `film production decide` does: `text` says it plainly, `quote` is his own words verbatim (required: never file a decision he did not make; what is still his to choose is an `ask`), `by` is who you are. With a `set` it is a decision on that set (with a `point`, on that choice; a `variant`, the one he chose), and it answers the questions waiting there. It lands in the version open now. Answers the word as filed and the timeline's link.",
  parameters: OwnerWordParams,
  success: WordFiled,
  failure: LabRefused,
});

const NoteTool = Tool.make('note', {
  description:
    "File a note the owner gave in chat on a production's timeline, as `film production note` does: his feedback, which decides nothing and answers no question waiting there. `text`, `quote` (his own words verbatim, required) and `by` as for `decide`; a `set`, its `point` and a `variant` say what it is about. Answers the word as filed and the timeline's link.",
  parameters: OwnerWordParams,
  success: WordFiled,
  failure: LabRefused,
});

const LabToolkit = Toolkit.make(
  Overview,
  Changes,
  Notes,
  Board,
  CatalogueTool,
  Sets,
  SetTool,
  Reply,
  Resolve,
  RequestTweak,
  PublishSet,
  RecordRender,
  AskTool,
  AskReadTool,
  AsksTool,
  CloseAsk,
  DecideTool,
  NoteTool,
);

// ---------------------------------------------------------------------------
// The reads and writes, over the lab's stores

/** Where the tools' links point and how a set's kind is told. */
interface LabMcpOptions {
  /** The lab's own links: on this machine, and from the owner's phone when it listens there. */
  readonly links: LabLinks;
}

/** A path under `root` that stays under it: `rel` relative, with no `..` out of it. */
const inside = (path: Path.Path, root: string, rel: string): Option.Option<string> => {
  if (path.isAbsolute(rel)) return Option.none();
  const at = path.resolve(root, rel);
  return Option.liftPredicate(at, (a) => a.startsWith(`${root}${path.sep}`));
};

/** The lab's reads and writes as the tools, the resources and the prompt use them. */
const labReads = Effect.fn('LabMcp.reads')(function* (options: LabMcpOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const notes = yield* NotesStore;
  const boards = yield* BoardStore;
  const folder = yield* FilmFolder;
  const review = yield* Review;
  const store = yield* ContentStore;
  const catalogues = yield* RenderCatalogue;
  const events = yield* LabEvents;
  const films = yield* Effect.context<FilmFolder>();
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const out = yield* filmsOut;
  const asks = yield* AskStore;
  const productions = yield* ProductionStore;

  const linksOf = (at: string) => linksAt(options.links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

  const noteRead = (film: FilmName, note: Note): typeof NoteRead.Type => ({
    ...note,
    links: linksOf(notePath(note)),
    stillFile: path.join(notes.paths(film).stills, note.still),
  });

  /** The sets under the roots: a folder with a `review.json` is a montage, else one with a `catalogue.json` a project. */
  const sets = Effect.gen(function* () {
    const listed = yield* reviewFolders(review.roots).pipe(Effect.provideContext(platform));
    const found = yield* Effect.forEach(
      listed,
      (f) =>
        Effect.gen(function* () {
          const manifest = path.join(f.dir, 'review.json');
          if (yield* fs.exists(manifest).pipe(Effect.orElseSucceed(() => false))) {
            const title = Option.flatMap(
              Schema.decodeOption(ReviewManifestJson)(
                yield* fs.readFileString(manifest).pipe(Effect.orElseSucceed(() => '')),
              ),
              (m) => m.title,
            );
            return Option.some<typeof SetRead.Type>({
              set: f.ref,
              kind: 'montage',
              ...Option.match(title, { onNone: () => ({}), onSome: (t) => ({ title: t }) }),
              links: linksOf(pageHref.folder(f.ref)),
              dir: f.dir,
            });
          }
          if (
            yield* fs
              .exists(path.join(f.dir, CATALOGUE_FILE))
              .pipe(Effect.orElseSucceed(() => false))
          )
            return Option.some<typeof SetRead.Type>({
              set: f.ref,
              kind: 'project',
              links: linksOf(pageHref.folder(f.ref)),
              dir: f.dir,
            });
          return Option.none<typeof SetRead.Type>();
        }),
      { concurrency: 8 },
    );
    return Arr.getSomes(found);
  });

  const overview = Effect.gen(function* () {
    const names = yield* folder.names;
    const filmsRead = yield* Effect.forEach(names, (name) =>
      Effect.gen(function* () {
        const film = yield* named(name);
        const log = yield* refused(notes.read(film));
        const board = yield* refused(boards.read(film));
        const waiting = unresolved(log);
        return {
          film,
          links: linksOf(pageHref.board(film)),
          notes: {
            open: waiting.filter((n) => n.status === 'open').length,
            replied: waiting.filter((n) => n.status === 'replied').length,
            tweaks: waiting.filter((n) => n.panel?.ask === 'tweak').length,
          },
          board: {
            panels: board.panels.length,
            kept: board.panels.filter((p) => Option.isSome(Option.fromUndefinedOr(p.kept))).length,
            beatsApproved: board.approvals.length,
          },
        };
      }),
    );
    return {
      lab: options.links,
      cursor: (yield* events.since(Option.none())).cursor,
      films: filmsRead,
      sets: yield* sets,
    };
  });

  const notesOf = Effect.fn('LabMcp.notes')(function* (
    name: string,
    status: 'unresolved' | 'all' | NoteStatus,
  ) {
    const film = yield* named(name);
    const log = yield* refused(notes.read(film));
    const listed = Match.value(status).pipe(
      Match.when('all', () => log.notes),
      Match.when('unresolved', () => unresolved(log)),
      Match.orElse((only) => log.notes.filter((n) => n.status === only)),
    );
    return { film, seq: log.seq, notes: listed.map((n) => noteRead(film, n)) };
  });

  const boardOf = Effect.fn('LabMcp.board')(function* (name: string, beat: Option.Option<string>) {
    const film = yield* named(name);
    const board: BoardFile = yield* refused(boards.read(film));
    const images = boards.paths(film).folder;
    return {
      film,
      ...Option.match(Option.fromUndefinedOr(board.style), {
        onNone: () => ({}),
        onSome: (s) => ({ style: { id: s.id, name: s.name } }),
      }),
      panels: board.panels
        .filter((p) => Option.match(beat, { onNone: () => true, onSome: (b) => p.beat === b }))
        .map(({ tries, ...panel }) => ({
          ...panel,
          tries: tries.map((t) => ({
            n: t.n,
            file: path.join(images, t.file),
            made: t.made,
            ...Option.match(Option.fromUndefinedOr(t.note), {
              onNone: () => ({}),
              onSome: (note) => ({ note }),
            }),
            ...Option.match(Option.fromUndefinedOr(t.from), {
              onNone: () => ({}),
              onSome: (from) => ({ from }),
            }),
            at: t.at,
          })),
          links: linksOf(boardPath(film, panel.beat, Option.some(panel.at))),
        })),
      approvals: board.approvals.filter((a) =>
        Option.match(beat, { onNone: () => true, onSome: (b) => a.beat === b }),
      ),
    };
  });

  /** A set's ref and folder: by its ref, or a film's own project folder. */
  const folderOf = Effect.fn('LabMcp.folderOf')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    if (Option.isSome(set)) {
      const dir = yield* Effect.fromOption(pathOf(review.roots, set.value, path), () =>
        LabRefused.make({ reason: `no set ${set.value} under the lab's roots (see \`sets\`)` }),
      );
      return { ref: set.value, dir, name: path.basename(dir) };
    }
    if (Option.isNone(film))
      return yield* LabRefused.make({ reason: 'name the folder: a `set` ref, or a `film`' });
    const dir = folder.paths(yield* named(film.value)).out;
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({
        reason: `film ${film.value}'s folder ${dir} is under none of the lab's roots`,
      }),
    );
    return { ref, dir, name: film.value };
  });

  const catalogueOf = Effect.fn('LabMcp.catalogue')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    const at = yield* folderOf(film, set);
    const catalogue = yield* refused(catalogues.read({ name: at.name, out: at.dir }));
    return { set: at.ref, links: linksOf(pageHref.folder(at.ref)), catalogue };
  });

  /** A montage's manifest file, as the publish writes it. */
  const manifestAt = (dir: string): Manifest<{ readonly [k: string]: Schema.Json }> => ({
    file: path.join(dir, 'review.json'),
    codec: ManifestJson,
    empty: {},
  });

  const setOf = Effect.fn('LabMcp.set')(function* (ref: string) {
    const at = yield* folderOf(Option.none(), Option.some(ref));
    const file = path.join(at.dir, 'review.json');
    if (!(yield* refused(fs.exists(file))))
      return yield* LabRefused.make({
        reason: `set ${ref} has no review.json: read it with \`catalogue\``,
      });
    const manifest = yield* refused(
      store.read({ file, codec: ReviewManifestJson, empty: emptyManifest }),
    );
    return { set: ref, links: linksOf(pageHref.folder(ref)), dir: at.dir, manifest };
  });

  const reply = Effect.fn('LabMcp.reply')(function* (name: string, id: string, text: string) {
    const film = yield* named(name);
    const note = yield* refused(notes.reply(film, id, { by: 'agent', text, still: Option.none() }));
    return { note: noteRead(film, note) };
  });

  const resolve = Effect.fn('LabMcp.resolve')(function* (name: string, id: string) {
    const film = yield* named(name);
    return { note: noteRead(film, yield* refused(notes.resolve(film, id))) };
  });

  const requestTweak = Effect.fn('LabMcp.requestTweak')(function* (
    name: string,
    id: string,
    text: string,
    asked: Option.Option<number>,
  ) {
    const film = yield* named(name);
    const board = yield* refused(boards.read(film));
    const panel = yield* Effect.fromOption(panelById(board, id), () =>
      LabRefused.make({
        reason: `film ${film} has no panel ${id}; its panels are ${board.panels.map((p) => p.id).join(', ') || 'none'}`,
      }),
    );
    const set = Option.fromUndefinedOr(panel.text);
    if (Option.isSome(set))
      return yield* LabRefused.make({
        reason: `panel ${id} is a ${set.value._tag.toLowerCase()} the engine sets: it has no try to tweak`,
      });
    const n = Option.firstSomeOf([
      asked,
      Option.fromUndefinedOr(panel.kept),
      Option.map(Arr.last(panel.tries), (t) => t.n),
    ]);
    const shown = yield* Effect.fromOption(
      Option.flatMap(n, (k) => Arr.findFirst(panel.tries, (t) => t.n === k)),
      () =>
        LabRefused.make({
          reason:
            `panel ${id} has no try ${Option.getOrElse(n, () => 0) || ''}`.trim() +
            `; its tries are ${panel.tries.map((t) => t.n).join(', ') || 'none'}`,
        }),
    );
    const image = yield* refused(boards.image(film, shown.file));
    const still = yield* refused(fs.readFile(image));
    const draft: NoteDraft = {
      // A panel's note sits on its beat; the board names the panel, so it opens there.
      scene: panel.beat,
      T: 0,
      local: 0,
      frame: 0,
      ...Bool.match(panel.at === PANEL_START, {
        onTrue: () => ({}),
        onFalse: () => ({ mark: panel.at }),
      }),
      panel: { id: panel.id, try: shown.n, ask: 'tweak' },
      text,
    };
    const note = yield* refused(notes.add(film, draft, still));
    return { note: noteRead(film, note) };
  });

  const publishSet = Effect.fn('LabMcp.publishSet')(function* (
    name: string,
    files: ReadonlyArray<typeof SetFile.Type>,
    patch: typeof ManifestPatch.Type,
  ) {
    const dir = path.join(out, name);
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({ reason: `the lab's out/ (${out}) is under none of its review roots` }),
    );
    // Every file checked before anything is written.
    const copies = yield* Effect.forEach(files, (f) =>
      Effect.gen(function* () {
        if (!path.isAbsolute(f.from))
          return yield* LabRefused.make({
            reason: `${f.from}: name the file by its absolute path`,
          });
        const info = yield* refused(fs.stat(f.from));
        if (info.type !== 'File')
          return yield* LabRefused.make({ reason: `${f.from} is not a file` });
        const rel = f.to ?? path.basename(f.from);
        if (!SET_FILE.test(rel))
          return yield* LabRefused.make({
            reason: `${rel}: a set carries images, videos, sound, docs and captions`,
          });
        const to = yield* Effect.fromOption(inside(path, dir, rel), () =>
          LabRefused.make({ reason: `${rel} is not a place in the set's folder` }),
        );
        return { from: f.from, to };
      }),
    );
    const written = yield* refused(
      store.transact(manifestAt(dir), (current) =>
        Effect.gen(function* () {
          for (const copy of copies) {
            yield* fs.makeDirectory(path.dirname(copy.to), { recursive: true });
            // Copied whole: the review never lists half a video.
            yield* writeWholeWith(
              fs,
              copy.to,
              (partial) => fs.copyFile(copy.from, partial),
              (partial) => fs.rename(partial, copy.to),
            );
          }
          const next = { ...current, ...patch };
          const manifest = yield* Schema.decodeUnknownEffect(ReviewManifest)(next).pipe(
            Effect.mapError((e) => LabRefused.make({ reason: `review.json: ${e.message}` })),
          );
          const named = [
            ...manifest.docs,
            ...manifest.images,
            ...manifest.videos,
            ...manifest.downloads,
          ];
          const missing = yield* Effect.filter(named, (file) =>
            Option.match(inside(path, dir, file), {
              onNone: () => Effect.succeed(true),
              onSome: (at) => Effect.map(fs.exists(at), (there) => !there),
            }),
          );
          if (missing.length > 0)
            return yield* LabRefused.make({
              reason: `review.json names what the folder lacks: ${missing.join(', ')}`,
            });
          return [manifest, next] as const;
        }),
      ),
    );
    yield* Effect.log(`lab.mcp.publish set=${ref} files=${copies.length}`);
    return { set: ref, links: linksOf(pageHref.folder(ref)), dir, manifest: written };
  });

  const recordRender = Effect.fn('LabMcp.recordRender')(function* (
    name: string,
    given: Omit<Render, 'at'>,
  ) {
    const at = yield* folderOf(Option.some(name), Option.none());
    const files = [
      ...Option.toArray(given.files.clip),
      ...Option.toArray(given.files.share),
      ...Option.toArray(given.files.captions),
      ...Option.toArray(given.files.chapters),
      ...given.files.images,
    ];
    const missing = yield* Effect.filter(files, (file) =>
      Option.match(inside(path, at.dir, file), {
        onNone: () => Effect.succeed(true),
        onSome: (where) =>
          Effect.map(fs.exists(where).pipe(Effect.orElseSucceed(() => false)), (there) => !there),
      }),
    );
    if (missing.length > 0)
      return yield* LabRefused.make({
        reason: `the render names files its project folder ${at.dir} lacks: ${missing.join(', ')}`,
      });
    const render: Render = { ...given, at: yield* Clock.currentTimeMillis };
    yield* refused(catalogues.record({ name: at.name, out: at.dir }, render));
    return { set: at.ref, links: linksOf(pageHref.folder(at.ref)) };
  });

  const askRead = (record: AskRecord): typeof AskRead.Type => ({
    ask: record.id,
    title: record.title,
    by: record.by,
    status: askStatus(record.state),
    ...Match.value(record.state).pipe(
      Match.tag('Asking', 'Answered', (s) => ({ step: s.step })),
      Match.orElse(() => ({})),
    ),
    answers: record.state.answers,
    answered: record.answered.map((a) => ({ step: a.step, at: a.at })),
    ...Match.value(record.state).pipe(
      Match.tag('Closed', (s) => ({ closed: s.why })),
      Match.orElse(() => ({})),
    ),
    ...Struct.pick(record, ['deadline', 'production', 'set', 'point']),
    links: linksOf(pageHref.ask(record.id)),
  });

  /**
   * An ask's words on its production's timeline, each filed once by the ask's
   * id (`withAskSaid`, under the ledger's lock): its question (when it names a
   * set) as it is made, and once closed, its answers (answered to its end) or
   * its withdrawal (closed before). A filing that failed is filed by the next
   * close of the ask, and two closes at once file one word.
   */
  const fileAsk = (record: AskRecord) =>
    Option.match(Option.fromUndefinedOr(record.production), {
      onNone: () => Effect.void,
      onSome: (production) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const set = Option.map(Option.fromUndefinedOr(record.set), setPathOf);
          const on = {
            set,
            point: Option.fromUndefinedOr(record.point),
            variant: Option.none<string>(),
            ask: Option.some(record.id),
            by: Option.some(record.by),
          };
          const named = `${record.title} (ask ${record.id})`;
          const question = Arr.filter(
            [
              {
                _tag: 'Asked' as const,
                at: Option.getOrElse(
                  Option.map(DateTime.make(record.created), DateTime.toEpochMillis),
                  () => now,
                ),
                text: named,
                quote: Option.none<string>(),
                ...on,
              },
            ],
            () => Option.isSome(set),
          );
          const closing = Match.value(record.state).pipe(
            Match.tag('Closed', (closed): ReadonlyArray<Said> => {
              if (!answeredToEnd(record))
                return [
                  {
                    _tag: 'Noted',
                    at: now,
                    text: `${named} withdrawn: ${closed.why}`,
                    quote: Option.none(),
                    ...on,
                  },
                ];
              // The owner's decision: what they gave, an optional field left empty left out.
              const given = givenAnswers(closed.answers);
              const words = Object.values(given).flatMap((a) =>
                Match.value(a).pipe(
                  Match.discriminatorsExhaustive('kind')({
                    choose: (): ReadonlyArray<string> => [],
                    free_text: (t) => [t.text],
                    skipped: (): ReadonlyArray<string> => [],
                  }),
                ),
              );
              // Every answer skipped still reads as answered: the line then names them all.
              const line = answersLine(
                Option.getOrElse(
                  Option.liftPredicate(given, (g) => !Record.isEmptyRecord(g)),
                  () => closed.answers,
                ),
              );
              return [
                {
                  _tag: 'Decided',
                  at: now,
                  text: `${named}: ${line}`,
                  quote: Option.liftPredicate(words.join(' / '), (w) => w.length > 0),
                  ...on,
                },
              ];
            }),
            Match.orElse((): ReadonlyArray<Said> => []),
          );
          const words: ReadonlyArray<Said> = [...question, ...closing];
          if (words.length === 0) return;
          yield* refused(
            productions.modify(production, (current) =>
              Result.succeed(words.reduce(withAskSaid, current)),
            ),
          );
        }),
    });

  /** The folder a timeline names the set `given` by (`setNamed`): by its ref or by its folder, held by one root. */
  const folderNamed = Effect.fn('LabMcp.folderNamed')(function* (given: string) {
    const named = setNamed(
      (yield* sets).map((listed) => listed.set),
      given,
    );
    if (Result.isFailure(named))
      return yield* LabRefused.make({
        reason: `${named.failure.folder} is a folder in more than one root (${named.failure.refs.join(', ')}), and a production's timeline names a set by its folder alone: rename one, or leave out \`set\``,
      });
    return yield* Option.match(named.success, {
      onNone: () =>
        Effect.fail(
          LabRefused.make({
            reason: `no set ${given}: \`sets\` lists them by ref (a folder under its root names one too)`,
          }),
        ),
      onSome: (set) => Effect.succeed(set.folder),
    });
  });

  const ask = Effect.fn('LabMcp.ask')(function* (given: typeof AskTool.parametersSchema.Type) {
    const blocks = Option.fromUndefinedOr(given.blocks);
    const flow = Option.fromUndefinedOr(given.machine);
    if (Option.isSome(blocks) && Option.isSome(flow))
      return yield* LabRefused.make({ reason: 'give `blocks` or `machine`, not both' });
    const machine = Option.orElse(flow, () =>
      Option.map(blocks, (b) => oneQuestion(b, given.thanks)),
    );
    if (Option.isNone(machine))
      return yield* LabRefused.make({ reason: 'give `blocks` (one page) or `machine`' });
    const production = Option.fromUndefinedOr(given.production);
    const set = Option.fromUndefinedOr(given.set);
    if (Option.isSome(set) && Option.isNone(production))
      return yield* LabRefused.make({ reason: '`set` files the ask on a production: name it' });
    if (Option.isSome(Option.fromUndefinedOr(given.point)) && Option.isNone(set))
      return yield* LabRefused.make({ reason: '`point` is a choice in a set: name the `set`' });
    if (
      Option.isSome(production) &&
      Option.isNone(yield* refused(productions.read(production.value)))
    )
      return yield* LabRefused.make({
        reason: `no production ${production.value}: film production new ${production.value} --title "<title>"`,
      });
    if (Option.isSome(set) && !(yield* sets).some((s) => s.set === set.value))
      return yield* LabRefused.make({ reason: `no set ${set.value}: \`sets\` lists them by ref` });
    // Its timeline names the set by its folder: one two roots hold is refused.
    if (Option.isSome(set)) yield* folderNamed(set.value);
    const record = yield* asks.make({ ...given, ask: machine.value }).pipe(
      Effect.mapError((e) =>
        LabRefused.make({
          reason: Match.value(e).pipe(
            Match.tag('AskInvalid', (i) => `the ask may not render:\n- ${i.problems.join('\n- ')}`),
            Match.orElse((other) => other.message),
          ),
        }),
      ),
    );
    yield* fileAsk(record);
    return askRead(record);
  });

  const askOf = (id: string) => Effect.map(refused(asks.read(id)), askRead);

  const asksOf = (status: Option.Option<'asking' | 'answered' | 'closed'>) =>
    Effect.map(refused(asks.list), (all) => ({
      asks: all
        .filter((r) =>
          Option.match(status, { onNone: () => true, onSome: (st) => askStatus(r.state) === st }),
        )
        .map(askRead),
    }));

  const closeAsk = Effect.fn('LabMcp.closeAsk')(function* (id: string, why: string) {
    const record = yield* refused(asks.close(id, why));
    yield* fileAsk(record);
    return askRead(record);
  });

  /**
   * The owner's word from chat on its production's timeline, through the
   * store's own `say` (as `film production decide|note`), in the version
   * open now: its words, who filed it, and the set, choice and variant it
   * is about.
   */
  const fileWord = Effect.fn('LabMcp.fileWord')(function* (
    tag: OwnerWord['_tag'],
    given: typeof OwnerWordParams.Type,
  ) {
    const production = given.production;
    if (Option.isNone(yield* refused(productions.read(production))))
      return yield* LabRefused.make({
        reason: `no production ${production}: film production new ${production} --title "<title>"`,
      });
    const point = Option.fromUndefinedOr(given.point);
    const variant = Option.fromUndefinedOr(given.variant);
    const named = Option.fromUndefinedOr(given.set);
    if (Option.isSome(point) && Option.isNone(named))
      return yield* LabRefused.make({ reason: '`point` is a choice in a set: name the `set`' });
    if (Option.isSome(variant) && Option.isNone(point))
      return yield* LabRefused.make({
        reason: "`variant` is one of a choice's: name the `point`",
      });
    const set = yield* Option.match(named, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (ref) => Effect.asSome(folderNamed(ref)),
    });
    const at = yield* Clock.currentTimeMillis;
    const said: OwnerWord = {
      _tag: tag,
      at,
      text: given.text,
      quote: Option.some(given.quote),
      set,
      point,
      variant,
      ask: Option.none(),
      by: Option.some(given.by),
    };
    const file = yield* refused(productions.say(production, said));
    const version = versionAt(file, at);
    return {
      production,
      version,
      said,
      links: linksOf(pageHref.production(production, version)),
    };
  });

  return {
    ask,
    askOf,
    asksOf,
    closeAsk,
    fileWord,
    overview,
    notesOf,
    boardOf,
    catalogueOf,
    sets,
    setOf,
    reply,
    resolve,
    requestTweak,
    publishSet,
    recordRender,
    events,
  };
});

/** A `review.json` with nothing in it, as the review reads one. */
const emptyManifest = Schema.decodeSync(ReviewManifestJson)('{}');

/** The tools' handlers over the lab's reads and writes. */
const handlers = (options: LabMcpOptions) =>
  LabToolkit.toLayer(
    Effect.map(labReads(options), (lab) =>
      LabToolkit.of({
        overview: logged('overview', () => lab.overview),
        changes: logged('changes', ({ since, wait }) =>
          lab.events.wait(Option.fromUndefinedOr(since), Duration.seconds(wait ?? 0)),
        ),
        notes: logged('notes', ({ film, status }) => lab.notesOf(film, status ?? 'unresolved')),
        board: logged('board', ({ film, beat }) => lab.boardOf(film, Option.fromUndefinedOr(beat))),
        catalogue: logged('catalogue', ({ film, set }) =>
          lab.catalogueOf(Option.fromUndefinedOr(film), Option.fromUndefinedOr(set)),
        ),
        sets: logged('sets', () => Effect.map(lab.sets, (sets) => ({ sets }))),
        set: logged('set', ({ set }) => lab.setOf(set)),
        reply: logged('reply', ({ film, note, text }) => lab.reply(film, note, text)),
        resolve: logged('resolve', ({ film, note }) => lab.resolve(film, note)),
        request_tweak: logged('request_tweak', ({ film, panel, text, try: n }) =>
          lab.requestTweak(film, panel, text, Option.fromUndefinedOr(n)),
        ),
        publish_set: logged('publish_set', ({ name, files, manifest }) =>
          lab.publishSet(name, files ?? [], manifest),
        ),
        record_render: logged('record_render', ({ film, render }) =>
          lab.recordRender(film, render),
        ),
        ask: logged('ask', (given) => lab.ask(given)),
        ask_read: logged('ask_read', ({ ask }) => lab.askOf(ask)),
        asks: logged('asks', ({ status }) => lab.asksOf(Option.fromUndefinedOr(status))),
        close_ask: logged('close_ask', ({ ask, why }) => lab.closeAsk(ask, why)),
        decide: logged('decide', (given) => lab.fileWord('Decided', given)),
        note: logged('note', (given) => lab.fileWord('Noted', given)),
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Resources and the prompt

/** A read as a resource's JSON. */
const json =
  <S extends Schema.Top>(schema: S) =>
  (value: S['Type']) =>
    Effect.map(
      Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value),
      (text) => text,
    );

const filmParam = McpSchema.param('film', Schema.String);

/** The lab's reads as resources: what a client attaches by `@lab:lab://…`. */
const resources = (options: LabMcpOptions) => {
  const reads = labReads(options);
  return Layer.mergeAll(
    McpServer.resource({
      uri: 'lab://overview',
      name: 'The lab',
      description: "Every film's open notes and board, every set, and the change feed's cursor.",
      mimeType: 'application/json',
      content: Effect.flatMap(reads, (lab) => Effect.flatMap(lab.overview, json(OverviewRead))),
    }),
    McpServer.resource({
      uri: 'lab://changes',
      name: 'Recent changes',
      description:
        'The changes the lab has seen since it started, newest last (at most the last 50).',
      mimeType: 'application/json',
      content: Effect.flatMap(reads, (lab) =>
        Effect.flatMap(
          Effect.flatMap(lab.events.since(Option.none()), (now) =>
            lab.events.since(Option.some(now.cursor.replace(/\.\d+$/, '.0'))),
          ),
          (all) => json(LabChanges)({ ...all, changes: all.changes.slice(-50) }),
        ),
      ),
    }),
    McpServer.resource`lab://films/${filmParam}/notes`({
      name: "A film's open notes",
      description: 'The notes on the film that wait: open or replied, not yet done.',
      mimeType: 'application/json',
      content: (_uri, film) =>
        Effect.flatMap(reads, (lab) =>
          Effect.flatMap(lab.notesOf(film, 'unresolved'), json(NotesRead)),
        ),
    }),
    McpServer.resource`lab://films/${filmParam}/board`({
      name: "A film's board",
      description: 'Its panels, their tries on disk, the tries kept and the beats approved.',
      mimeType: 'application/json',
      content: (_uri, film) =>
        Effect.flatMap(reads, (lab) =>
          Effect.flatMap(lab.boardOf(film, Option.none()), json(BoardRead)),
        ),
    }),
  );
};

/** One line a waiting note is listed by in the prompt. */
const noteLine = (note: typeof NoteRead.Type) => {
  const panel = Option.fromUndefinedOr(note.panel);
  const asks = Option.match(
    Option.filter(panel, (p) => p.ask === 'tweak'),
    {
      onNone: () => note.status,
      onSome: () => 'tweak',
    },
  );
  const about = Option.match(panel, {
    onNone: () => `scene ${note.scene}`,
    onSome: (p) => `panel ${p.id}`,
  });
  return `- ${note.film} ${note.id} [${asks}] ${about}: ${gist(note.text, 400)}\n  ${[note.links.local, ...Option.toArray(Option.fromUndefinedOr(note.links.phone))].join(' · ')}`;
};

const inbox = (options: LabMcpOptions) =>
  McpServer.prompt({
    name: 'inbox',
    title: 'What waits in the lab',
    description:
      "The owner's notes that wait across every film, and how to work them through the lab.",
    content: () =>
      Effect.gen(function* () {
        const lab = yield* labReads(options);
        const overview = yield* lab.overview;
        const waiting = yield* Effect.forEach(overview.films, (f) =>
          Effect.map(lab.notesOf(f.film, 'unresolved'), (n) => n.notes),
        );
        const lines = Arr.flatten(waiting).map(noteLine);
        return [
          `The film lab (${overview.lab}) through its MCP tools.`,
          Arr.match(lines, {
            onEmpty: () => 'No note waits on an agent.',
            onNonEmpty: (waiting) => `These notes wait:\n${waiting.join('\n')}`,
          }),
          'For each: read it in full (`notes`, `board`; its still is a PNG on disk), do the work, then `reply` saying what changed and where to look, and `resolve` it once made. A tweak note is acted on with `bun run board tweak <film> <note>` in apps/animations.',
          `To hear what the owner does next, call \`changes\` with since=${overview.cursor} and wait=60, again with each cursor it answers.`,
        ].join('\n\n');
      }),
  });

// ---------------------------------------------------------------------------
// The server

const INSTRUCTIONS = [
  'The film lab, where the owner reviews the films: notes on frames and board panels, tries kept, beats and renders approved, sets of renders compared. Read with `overview`, `notes`, `board`, `catalogue`, `sets`, `set`; act with `reply`, `resolve`, `request_tweak`, `publish_set`, `record_render`.',
  'Listen with `changes`: pass the cursor from `overview` as `since` and a `wait` in seconds; it answers as soon as the owner does something (a note, a reply, a kept try, an approval or withdrawal, a comment, a render or set, an answer to an ask), each change with its film, panel or render, its words and its lab link. Call it again with the cursor it answers.',
  "Hand the owner work to review as a guided review (`ask`): one page, a section per piece of material in the flow's order (script → concept → Board → voice → animatic → Rive scenes → sound → render → shorts), each the material itself in place (a script as a `script` block, never a `document` of its Markdown, and one script per ask; the Board, a video, a take, a set's document), then its questions, each a `choose` with your recommendation marked and its `why`; never a path, a link to elsewhere or prose describing what to open. Publish the files first as a set (`publish_set`) when the material is new; reply on the note that asked for it.",
  "When a decision is the owner's, ask it (`ask`), each question a `choose` with one option `recommended` (an optional `free_text` beside it for anything else; words are a burden to require); hand the owner its link, hear each answer on `changes` (`ask.step`, `ask.answered`), and `close_ask` once acted on.",
  "When the owner has already decided in chat, file it on his production's timeline with `decide` (feedback that decides nothing, `note`), his own words verbatim as `quote`: never file a decision he did not make. What is still his to choose is an `ask`.",
  EASEL_INSTRUCTIONS,
].join('\n\n');

/**
 * What the lab's MCP runs over beside its router: the lab's stores, its
 * change feed, its easel and its fresh runs of the film CLI.
 */
export type LabMcpNeeds =
  | AskStore
  | ProductionStore
  | NotesStore
  | RenderCatalogue
  | BoardStore
  | FilmFolder
  | Review
  | ContentStore
  | Easel
  | FreshFilm
  | FileSystem.FileSystem
  | Path.Path;

/**
 * The lab's MCP at `/mcp` on the lab's router, over its stores and its change
 * feed. The routes it adds are the lab's own: the gate (`api-server.ts`)
 * runs first, as for every path. A client ends its session with a DELETE
 * (the transport keeps a session until then: it has no expiry).
 */
export const labMcp = (options: LabMcpOptions) =>
  Layer.mergeAll(
    McpServer.toolkit(LabToolkit).pipe(Layer.provideMerge(handlers(options))),
    easelMcp,
    resources(options),
    inbox(options),
  ).pipe(
    Layer.provide(
      McpServer.layerHttp({
        name: 'film-lab',
        version: '0.1.0',
        instructions: INSTRUCTIONS,
        path: MCP_PATH,
        protocols: [
          McpProtocol.v2025_11_25,
          McpProtocol.v2025_06_18,
          McpProtocol.v2025_03_26,
          McpProtocol.v2026_07_28,
        ],
        allowSessionTermination: true,
      }),
    ),
    Layer.orDie,
  );
