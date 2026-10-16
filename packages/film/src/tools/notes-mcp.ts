// The lab MCP's notes and board (`lab-mcp.ts` serves them): a film's notes
// (`notes`) and its storyboard (`board`) read, and the writes on them, each
// through the store the page and the CLI write through (`NotesStore`,
// `BoardStore`): a reply or a note marked done (`reply`, `resolve`), and a
// tweak asked of a panel (`request_tweak`).

import {
  Array as Arr,
  Boolean as Bool,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Schema,
  Struct,
} from 'effect';
import { McpServer, Tool, Toolkit } from 'effect/ai';
import {
  type BoardFile,
  BoardStyle,
  PANEL_START,
  Panel,
  panelById,
  shownTry,
  tryOf,
} from '../core/board.ts';
import { LabLinks, boardPath, linksAt, notePath } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import { Note, type NoteDraft, NoteStatus } from '../core/schema.ts';
import { BoardStore } from './board-store.ts';
import { type FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FilmParam, LabRefused, type LabMcpOptions, refused } from './lab-mcp-parts.ts';
import { logged } from './mcp-calls.ts';
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
    "Ask for a board panel to be made again, as a tweak note on it (what `film board tweak <film> <note>` acts on), its still the try it starts from: `try`, else the one the Board shows (the kept one, else the first). Use it to put the owner's word from chat onto the board. The note sits at its beat's start in the Lab and on its panel on the Board.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    panel: Schema.String.annotate({ description: 'The panel (`<beat>.<mark>`).' }),
    text: Schema.String.check(Schema.isNonEmpty()),
    try: Schema.optionalKey(Schema.Int),
  }),
  success: NoteWritten,
  failure: LabRefused,
});

const NotesToolkit = Toolkit.make(Notes, Board, Reply, Resolve, RequestTweak);

// ---------------------------------------------------------------------------
// The reads and writes, over the notes and the boards

/** A film's notes and board as the tools, the resources and the prompt read and write them. */
export const notesReads = Effect.fn('LabMcp.notesReads')(function* (options: LabMcpOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const notes = yield* NotesStore;
  const boards = yield* BoardStore;
  const films = yield* Effect.context<FilmFolder>();

  const linksOf = (at: string) => linksAt(options.links, at);
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
          links: linksOf(boardPath(film, panel.beat, Option.some(panel.at))),
        })),
      approvals: board.approvals.filter((a) =>
        Option.match(beat, { onNone: () => true, onSome: (b) => a.beat === b }),
      ),
    };
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
    // The try asked for, else the one the Board shows (kept, else the first).
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

  return { notesOf, boardOf, reply, resolve, requestTweak };
});

/** The notes' and the board's tools, served by the lab's MCP server. */
export const notesMcp = (options: LabMcpOptions) =>
  McpServer.toolkit(NotesToolkit).pipe(
    Layer.provideMerge(
      NotesToolkit.toLayer(
        Effect.map(notesReads(options), (lab) =>
          NotesToolkit.of({
            notes: logged('notes', ({ film, status }) => lab.notesOf(film, status ?? 'unresolved')),
            board: logged('board', ({ film, beat }) =>
              lab.boardOf(film, Option.fromUndefinedOr(beat)),
            ),
            reply: logged('reply', ({ film, note, text }) => lab.reply(film, note, text)),
            resolve: logged('resolve', ({ film, note }) => lab.resolve(film, note)),
            request_tweak: logged('request_tweak', ({ film, panel, text, try: n }) =>
              lab.requestTweak(film, panel, text, Option.fromUndefinedOr(n)),
            ),
          }),
        ),
      ),
    ),
  );
