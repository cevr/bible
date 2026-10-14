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
// - Resources (`lab://…`) say the same reads for a client that attaches
//   them; the `inbox` prompt opens a session on what waits.
//
// The lab is reached through a public tunnel that forwards the visitor's
// Host from 127.0.0.1, so neither the Host nor the peer tells a local agent
// from the internet: `/mcp` answers only a request with the lab's token
// (`Authorization: Bearer …`, `labMcpToken`), with a loopback Host, that no
// proxy forwarded. The lab's gate (`api-server.ts`) runs first, as for any
// path. Effect's server refuses a request with a foreign `Origin`.

import {
  Array as Arr,
  Boolean as Bool,
  Clock,
  Config,
  Crypto,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Schema,
  Struct,
} from 'effect';
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from 'effect/ai';
import { Headers, HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { pageHref } from '../core/api.ts';
import { type BoardFile, BoardStyle, PANEL_START, Panel, panelById } from '../core/board.ts';
import { Catalogue, Render } from '../core/catalogue.ts';
import { boardPath, gist, notePath } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import { ReviewManifest, ReviewManifestJson } from '../core/review.ts';
import { Note, type NoteDraft, NoteStatus, repoJson } from '../core/schema.ts';
import { BoardStore } from './board-store.ts';
import { CATALOGUE_FILE, RenderCatalogue } from './catalogue.ts';
import { ContentStore, type Manifest, writeWholeWith } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder, type FilmName, filmNamed, filmsOut } from './film-repo.ts';
import { LabChanges, LabEvents, reviewFolders } from './lab-events.ts';
import { NotesStore } from './notes-store.ts';
import { Review, refOf, pathOf } from './review.ts';
import { urlPath } from './review-file.ts';

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
  link: Schema.String,
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
  link: Schema.String,
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
  link: Schema.String,
  /** Where it is on this machine. */
  dir: Schema.String,
});

const FilmRead = Schema.Struct({
  film: Schema.String,
  link: Schema.String,
  notes: Schema.Struct({ open: Schema.Int, replied: Schema.Int, tweaks: Schema.Int }),
  board: Schema.Struct({
    panels: Schema.Int,
    kept: Schema.Int,
    beatsApproved: Schema.Int,
  }),
});

const OverviewRead = Schema.Struct({
  /** The lab's address as the owner opens it. */
  lab: Schema.String,
  /** The change feed's cursor now: hand it to `changes`. */
  cursor: Schema.String,
  films: Schema.Array(FilmRead),
  sets: Schema.Array(SetRead),
});

const CatalogueRead = Schema.Struct({
  set: Schema.String,
  link: Schema.String,
  catalogue: Catalogue,
});

const SetManifestRead = Schema.Struct({
  set: Schema.String,
  link: Schema.String,
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

const Changes = Tool.make('changes', {
  description: `What changed in the lab past \`since\` (a cursor from \`overview\` or an earlier \`changes\`): notes, replies and notes done, tweaks asked, tries kept and beats approved or withdrawn on a board, comments, approvals and withdrawals on renders, renders recorded, sets published or updated. Each change names its film, panel, render or set, its words, and its lab link. With \`wait\` (seconds, at most ${MAX_WAIT_S}) it answers as soon as there is one, else with none when the time is up: call it again with the cursor it answers to keep listening. With no \`since\`, it answers no changes and the cursor now. \`reset\` means the cursor was from an earlier run of the lab: the changes are all this run kept.`,
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

const Sets = Tool.make('sets', {
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
  success: Schema.Struct({ set: Schema.String, link: Schema.String }),
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
);

// ---------------------------------------------------------------------------
// The reads and writes, over the lab's stores

/** Where the tools' links point and how a set's kind is told. */
interface LabMcpOptions {
  /** The lab's address as the owner opens it (`labLink`). */
  readonly base: string;
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

  const linkOf = (at: string) => new URL(at, options.base).href;
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

  const noteRead = (film: FilmName, note: Note): typeof NoteRead.Type => ({
    ...note,
    link: linkOf(notePath(note)),
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
              link: linkOf(pageHref.folder(f.ref)),
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
              link: linkOf(pageHref.folder(f.ref)),
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
          link: linkOf(pageHref.board(film)),
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
      lab: options.base,
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
          link: linkOf(boardPath(film, panel.beat, Option.some(panel.at))),
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
    return { set: at.ref, link: linkOf(pageHref.folder(at.ref)), catalogue };
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
    return { set: ref, link: linkOf(pageHref.folder(ref)), dir: at.dir, manifest };
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
    return { set: ref, link: linkOf(pageHref.folder(ref)), dir, manifest: written };
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
    return { set: at.ref, link: linkOf(pageHref.folder(at.ref)) };
  });

  return {
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
        overview: () => lab.overview,
        changes: ({ since, wait }) =>
          lab.events.wait(Option.fromUndefinedOr(since), Duration.seconds(wait ?? 0)),
        notes: ({ film, status }) => lab.notesOf(film, status ?? 'unresolved'),
        board: ({ film, beat }) => lab.boardOf(film, Option.fromUndefinedOr(beat)),
        catalogue: ({ film, set }) =>
          lab.catalogueOf(Option.fromUndefinedOr(film), Option.fromUndefinedOr(set)),
        sets: () => Effect.map(lab.sets, (sets) => ({ sets })),
        set: ({ set }) => lab.setOf(set),
        reply: ({ film, note, text }) => lab.reply(film, note, text),
        resolve: ({ film, note }) => lab.resolve(film, note),
        request_tweak: ({ film, panel, text, try: n }) =>
          lab.requestTweak(film, panel, text, Option.fromUndefinedOr(n)),
        publish_set: ({ name, files, manifest }) => lab.publishSet(name, files ?? [], manifest),
        record_render: ({ film, render }) => lab.recordRender(film, render),
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
  return `- ${note.film} ${note.id} [${asks}] ${about}: ${gist(note.text, 400)}\n  ${note.link}`;
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
// Access, and the server

/** The names a loopback Host has. */
const LOOPBACK_NAMES: ReadonlyArray<string> = ['localhost', '127.0.0.1', '[::1]'];

/** Headers a proxy in front adds: a request that carries one came through it (the tunnel). */
const FORWARDED: ReadonlyArray<string> = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-real-ip',
];

/** Why `request` may not use the MCP, or none: a loopback Host, nothing forwarded, the token. */
const mcpRefusal = (
  headers: Headers.Headers,
  token: string,
): Option.Option<{ readonly status: number; readonly reason: string }> => {
  const host = Option.getOrElse(Headers.get(headers, 'host'), () => '');
  const name = host.replace(/:\d+$/, '');
  if (!LOOPBACK_NAMES.includes(name))
    return Option.some({ status: 403, reason: `the MCP answers on loopback only, not ${host}` });
  const forwarded = FORWARDED.filter((h) => Option.isSome(Headers.get(headers, h)));
  if (forwarded.length > 0)
    return Option.some({
      status: 403,
      reason: `the MCP is not served through a proxy (${forwarded.join(', ')})`,
    });
  const given = Option.flatMap(Headers.get(headers, 'authorization'), (auth) =>
    Option.flatMap(Option.fromNullishOr(/^Bearer\s+(\S+)$/i.exec(auth)), ([, bearer]) =>
      Option.fromUndefinedOr(bearer),
    ),
  );
  // Compared by digest: equal lengths, and nothing of the token leaks by how long a compare takes.
  if (!Option.exists(given, (g) => sha256Hex(g) === sha256Hex(token)))
    return Option.some({
      status: 401,
      reason: 'the MCP needs the lab token: Authorization: Bearer <token>',
    });
  return Option.none();
};

/** The check in front of `/mcp`, for every request to it. */
const access = (token: string) =>
  HttpRouter.middleware(
    (routes) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const path = urlPath(request.url);
        if (path !== MCP_PATH && !path.startsWith(`${MCP_PATH}/`)) return yield* routes;
        // A request made in process (a test's) names its Host in its URL only.
        const host = Option.getOrElse(
          Option.orElse(Option.fromUndefinedOr(request.headers['host']), () =>
            Option.map(HttpServerRequest.toURL(request), (url) => url.host),
          ),
          () => '',
        );
        return yield* Option.match(mcpRefusal(Headers.set(request.headers, 'host', host), token), {
          onNone: () => routes,
          onSome: (refusal) =>
            Effect.as(
              Effect.logWarning(
                `lab.mcp.refused method=${request.method} status=${refusal.status} reason="${refusal.reason}"`,
              ),
              HttpServerResponse.jsonUnsafe(
                { error: 'McpRefused', reason: refusal.reason },
                {
                  status: refusal.status,
                  headers: Bool.match(refusal.status === 401, {
                    onTrue: () => ({ 'www-authenticate': 'Bearer' }),
                    onFalse: () => ({}),
                  }),
                },
              ),
            ),
        });
      }),
    { global: true },
  );

const INSTRUCTIONS = [
  'The film lab, where the owner reviews the films: notes on frames and board panels, tries kept, beats and renders approved, sets of renders compared. Read with `overview`, `notes`, `board`, `catalogue`, `sets`, `set`; act with `reply`, `resolve`, `request_tweak`, `publish_set`, `record_render`.',
  'Listen with `changes`: pass the cursor from `overview` as `since` and a `wait` in seconds; it answers as soon as the owner does something (a note, a reply, a kept try, an approval or withdrawal, a comment, a render or set), each change with its film, panel or render, its words and its lab link. Call it again with the cursor it answers.',
  'Hand the owner work as a set (`publish_set`) and its link, never a path; reply on the note that asked for it.',
].join('\n\n');

/** What the lab's MCP runs over beside its router: the lab's stores and its change feed. */
export type LabMcpNeeds =
  | NotesStore
  | RenderCatalogue
  | BoardStore
  | FilmFolder
  | Review
  | ContentStore
  | FileSystem.FileSystem
  | Path.Path;

/** How the lab is reached as an MCP server: its token and the address its links use. */
export interface McpAccess {
  readonly token: string;
}

/**
 * The lab's MCP at `/mcp` on the lab's router, over its stores and its change
 * feed, behind `access`. The routes it adds are the lab's own: the gate
 * (`api-server.ts`) runs first, as for every path.
 */
export const labMcp = (access_: McpAccess, options: LabMcpOptions) =>
  Layer.mergeAll(
    Layer.mergeAll(
      McpServer.toolkit(LabToolkit).pipe(Layer.provideMerge(handlers(options))),
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
        }),
      ),
      Layer.orDie,
    ),
    access(access_.token),
  );

// ---------------------------------------------------------------------------
// The token

/** A new token: 32 random bytes, hex. */
const newToken = Effect.map(
  Crypto.Crypto.use((crypto) => crypto.randomBytes(32)),
  (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''),
);

/**
 * The lab's MCP token: the file `FILM_LAB_MCP_TOKEN_FILE` names
 * (`~/.config/film-lab/mcp-token`), made on the first start, readable by its
 * owner only; the same token every start after, so a registered client
 * keeps working. Its file, beside it, for the line the lab logs.
 */
export const labMcpToken = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const file = yield* Config.String('FILM_LAB_MCP_TOKEN_FILE').pipe(
    Config.withDefault(path.join(home, '.config', 'film-lab', 'mcp-token')),
  );
  const kept = (yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ''))).trim();
  if (kept.length > 0) return { token: kept, file };
  const token = yield* newToken;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true, mode: 0o700 });
  yield* fs.writeFileString(file, `${token}\n`, { mode: 0o600 });
  yield* fs.chmod(file, 0o600);
  yield* Effect.log(`lab.mcp.token made file=${file}`);
  return { token, file };
});
