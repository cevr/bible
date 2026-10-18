// The lab's notes and board commands (`lab-command.ts`; MCP and `film lab`
// serve them): a film's notes (`notes`) and its storyboard (`board`) read,
// and the writes on them, each through the store the page writes through
// (`NotesStore`, `BoardStore`): a reply or a note marked done (`reply`,
// `resolve`), a tweak asked of a panel (`request_tweak`), a try kept
// (`keep_try`), and a beat's board approved or its approval withdrawn
// (`approve_beat`, `withdraw_beat`).

import {
  Array as Arr,
  Boolean as Bool,
  DateTime,
  Effect,
  FileSystem,
  Match,
  Option,
  Path,
  type Result,
  Schema,
  Struct,
} from 'effect';
import { Tool } from 'effect/ai';
import {
  type BoardFile,
  BoardName,
  type BoardRefusal,
  BoardStyle,
  PANEL_START,
  Panel,
  approvalOf,
  approveBeat,
  panelById,
  pickTry,
  shownTry,
  tryOf,
  withdrawBeat,
} from '../core/board.ts';
import { LabLinks, boardPath, linksAt, notePath } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import { Note, type NoteDraft, NoteStatus } from '../core/schema.ts';
import { BoardStore } from './board-store.ts';
import { type FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { LabAddress, labCommand } from './lab-command.ts';
import { FilmParam, LabRefused, refused } from './lab-mcp-parts.ts';
import { NotesStore } from './notes-store.ts';

// ---------------------------------------------------------------------------
// What the tools answer

/** A note as an agent reads it: the record, its page and its still on disk. */
export const NoteRead = Schema.Struct({
  ...Note.fields,
  /** The lab page it is on. */
  links: LabLinks,
  /** Its still, a PNG on this machine. */
  stillFile: Schema.String,
});

export const NotesRead = Schema.Struct({
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
  /** Its beat's board approval: approved as it stands, stale (a pick since), or none. */
  approval: Schema.Literals(['approved', 'stale', 'none']),
  links: LabLinks,
});

export const BoardRead = Schema.Struct({
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
  /** The images the board names that are missing from its folder, or changed since they were filed. */
  problems: Schema.Array(
    Schema.Struct({ file: Schema.String, problem: Schema.Literals(['missing', 'changed']) }),
  ),
});

const NoteWritten = Schema.Struct({ note: NoteRead });

// ---------------------------------------------------------------------------
// The tools

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

const Reply = Tool.make('reply', {
  description:
    "Reply in a note's thread, as the agent: the note becomes `replied` until the owner answers or it is marked done. Say what you did and where to look.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    note: Schema.String.annotate({ description: 'The note (`n12`).' }),
    text: Schema.String.check(Schema.isNonEmpty()),
    still: Schema.optionalKey(
      Schema.String.annotate({
        description:
          'A PNG on this machine to show with the reply, by its absolute path: the frame after the change',
      }),
    ),
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
    "Ask for a board panel to be made again, as a tweak note on it (what `film board tweak <film> <note>` acts on), its still the try it starts from: `try`, else the kept one, else the first. Use it to put the owner's word from chat onto the board. The note sits on its panel in the studio's inspector (its Board section), and its link opens the studio there.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    panel: Schema.String.annotate({ description: 'The panel (`<beat>.<mark>`).' }),
    text: Schema.String.check(Schema.isNonEmpty()),
    try: Schema.optionalKey(Schema.Int),
  }),
  success: NoteWritten,
  failure: LabRefused,
});

/** A board as a write leaves it. */
const BoardWritten = BoardRead;

const KeepTry = Tool.make('keep_try', {
  description:
    "Keep one try of a board panel, and say why in a sentence: the Board shows it, and a beat approved on another try goes stale. Use it to put the owner's pick from chat onto the board.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    panel: Schema.String.annotate({ description: 'The panel (`<beat>.<mark>`).' }),
    try: Schema.Int.annotate({ description: 'The try to keep.' }),
    why: Schema.optionalKey(Schema.String),
  }),
  success: BoardWritten,
  failure: LabRefused,
}).annotate(Tool.Idempotent, true);

const BeatParams = Schema.Struct({
  ...FilmParam.fields,
  beat: BoardName.annotate({ description: 'The beat, by its id.' }),
});

const ApproveBeat = Tool.make('approve_beat', {
  description:
    "Approve a beat's board as it stands, each picture panel on the try it keeps (refused while one keeps none): a later pick leaves it stale. On the owner's word only.",
  parameters: BeatParams,
  success: BoardWritten,
  failure: LabRefused,
}).annotate(Tool.Idempotent, true);

const WithdrawBeat = Tool.make('withdraw_beat', {
  description: "Withdraw a beat's board approval (refused when it has none).",
  parameters: BeatParams,
  success: BoardWritten,
  failure: LabRefused,
});

// ---------------------------------------------------------------------------
// The reads and writes, over the notes and the boards

/** A film's notes and board as the tools, the resources and the prompt read and write them. */
export const notesReads = Effect.fn('LabMcp.notesReads')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const links = yield* LabAddress;
  const path = yield* Path.Path;
  const notes = yield* NotesStore;
  const boards = yield* BoardStore;
  const films = yield* Effect.context<FilmFolder>();

  const linksOf = (at: string) => linksAt(links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

  const noteRead = (film: FilmName, note: Note): typeof NoteRead.Type => ({
    ...note,
    links: linksOf(notePath(note)),
    stillFile: path.join(notes.paths(film).stills, note.still),
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
          approval: approvalOf(board, panel.beat),
          links: linksOf(boardPath(film, panel.beat, Option.some(panel.at))),
        })),
      approvals: board.approvals.filter((a) =>
        Option.match(beat, { onNone: () => true, onSome: (b) => a.beat === b }),
      ),
      problems: (yield* refused(boards.problems(film))).map((p) => ({
        file: p.file,
        problem: p.problem,
      })),
    };
  });

  /** `film`'s board changed by `change` (a pick, an approval, a withdrawal), read back as `board` reads it. */
  const boardChanged = Effect.fn('LabMcp.boardChanged')(function* (
    name: string,
    change: (board: BoardFile, at: string) => Result.Result<BoardFile, BoardRefusal>,
  ) {
    const film = yield* named(name);
    const at = DateTime.formatIso(yield* DateTime.now);
    yield* refused(boards.modify(film, (board) => change(board, at)));
    return yield* boardOf(film, Option.none());
  });

  const reply = Effect.fn('LabMcp.reply')(function* (
    name: string,
    id: string,
    text: string,
    shown: Option.Option<string>,
  ) {
    const film = yield* named(name);
    const still = yield* Option.match(shown, {
      onNone: () => Effect.succeedNone,
      onSome: (file) =>
        Bool.match(path.isAbsolute(file), {
          onTrue: () => Effect.asSome(refused(fs.readFile(file))),
          onFalse: () =>
            Effect.fail(
              LabRefused.make({ reason: `${file}: name the still by its absolute path` }),
            ),
        }),
    });
    const note = yield* refused(notes.reply(film, id, { by: 'agent', text, still }));
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
    // The try asked for, else the kept one, else the first.
    const shown = yield* Effect.fromOption(
      Option.match(asked, { onSome: (n) => tryOf(panel, n), onNone: () => shownTry(panel) }),
      () => {
        const lacks = Option.match(asked, {
          onSome: (n) => `no try ${n}`,
          onNone: () => 'no try yet',
        });
        const tries = Arr.match(panel.tries, {
          onEmpty: () => 'none',
          onNonEmpty: (all) => all.map((t) => t.n).join(', '),
        });
        return LabRefused.make({ reason: `panel ${id} has ${lacks}; its tries are ${tries}` });
      },
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

  return { notesOf, boardOf, boardChanged, reply, resolve, requestTweak };
});

/** The work of the notes' and the board's commands. */
const lab = notesReads();

/** The notes' and the board's commands. */
export const notesCommands = [
  labCommand(Notes, {
    run: ({ film, status }) => Effect.flatMap(lab, (l) => l.notesOf(film, status ?? 'unresolved')),
  }),
  labCommand(Board, {
    run: ({ film, beat }) =>
      Effect.flatMap(lab, (l) => l.boardOf(film, Option.fromUndefinedOr(beat))),
  }),
  labCommand(Reply, {
    run: ({ film, note, text, still }) =>
      Effect.flatMap(lab, (l) => l.reply(film, note, text, Option.fromUndefinedOr(still))),
  }),
  labCommand(Resolve, {
    run: ({ film, note }) => Effect.flatMap(lab, (l) => l.resolve(film, note)),
  }),
  labCommand(RequestTweak, {
    run: ({ film, panel, text, try: n }) =>
      Effect.flatMap(lab, (l) => l.requestTweak(film, panel, text, Option.fromUndefinedOr(n))),
  }),
  labCommand(KeepTry, {
    run: ({ film, panel, try: n, why }) =>
      Effect.flatMap(lab, (l) =>
        l.boardChanged(film, (board) => pickTry(board, panel, n, Option.fromUndefinedOr(why))),
      ),
  }),
  labCommand(ApproveBeat, {
    run: ({ film, beat }) =>
      Effect.flatMap(lab, (l) => l.boardChanged(film, (board, at) => approveBeat(board, beat, at))),
  }),
  labCommand(WithdrawBeat, {
    run: ({ film, beat }) =>
      Effect.flatMap(lab, (l) => l.boardChanged(film, (board) => withdrawBeat(board, beat))),
  }),
];
