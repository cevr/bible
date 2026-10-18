// The lab as an MCP server, for agents: the running lab answers MCP at
// `/mcp` (Streamable HTTP, Effect's `McpServer`), so an agent reads what
// the owner said and kept in the lab, acts on it, and hears of each change
// as it happens, instead of reading files and handing links back and forth.
// One server over a toolkit each, every write through the store the page
// and the CLI write through, so there is no second write path:
//
// - Here: the films and sets (`overview`), and what changed past a cursor
//   (`changes`), which also waits for the next change: the event feed
//   (`LabEvents`) that every session, a subagent's too, can read.
// - A film's notes and board (`notes-mcp.ts`): `notes`, `board`, a reply or
//   a note marked done (`reply`, `resolve`), a tweak asked of a panel
//   (`request_tweak`).
// - The sets (`sets-mcp.ts`): `sets`, `set`, a project folder's catalogue
//   (`catalogue`), a set published (`publish_set`), a render recorded
//   (`record_render`).
// - Asks and the owner's word (`asks-mcp.ts`): a decision page (`ask`, on
//   the asker's open page of asks or a new one),
//   read (`ask_read`, `asks`) and closed (`close_ask`); his word from chat
//   filed (`decide`, `note`), and the production moved forward on his filed
//   decision (`forward`).
// - The studio's (`timeline-mcp.ts`): a film's timeline at one version, as
//   the studio page draws it (`timeline`), and an agent's "doing now" line
//   on its header (`working`).
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
  Duration,
  Effect,
  type FileSystem,
  Layer,
  Option,
  type Path,
  Schema,
} from 'effect';
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from 'effect/ai';
import { pageHref } from '../core/api.ts';
import { LabLinks, gist, linksAt } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import type { AskStore } from './ask-store.ts';
import { asksMcp } from './asks-mcp.ts';
import { BoardStore } from './board-store.ts';
import type { RenderCatalogue } from './catalogue.ts';
import type { ContentStore } from './content-store.ts';
import type { Easel } from './easel.ts';
import type { Critic } from './critique.ts';
import { EASEL_INSTRUCTIONS, easelMcp } from './easel-mcp.ts';
import { FilmFolder, filmNamed } from './film-repo.ts';
import type { FreshFilm } from './fresh-film.ts';
import { LabRefused, type LabMcpOptions, refused } from './lab-mcp-parts.ts';
import { LabChanges, LabEvents } from './lab-events.ts';
import { logged } from './mcp-calls.ts';
import { BoardRead, type NoteRead, NotesRead, notesMcp, notesReads } from './notes-mcp.ts';
import { NotesStore } from './notes-store.ts';
import type { ProductionStore } from './production-store.ts';
import type { Review } from './review.ts';
import { SetRead, setsMcp, setsReads } from './sets-mcp.ts';
import type { FilmTimelines } from './film-timeline.ts';
import { timelineMcp } from './timeline-mcp.ts';
import type { Working } from './working.ts';

/** Where the lab answers MCP. */
export const MCP_PATH = '/mcp';

/** The longest a `changes` call waits for a change, in seconds: well inside the lab's idle limit. */
const MAX_WAIT_S = 120;

// ---------------------------------------------------------------------------
// What the tools answer, and the tools

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

const LabToolkit = Toolkit.make(Overview, Changes);

// ---------------------------------------------------------------------------
// The reads, over the lab's stores

/** The lab as the overview, the resources and the prompt read it. */
const labReads = Effect.fn('LabMcp.reads')(function* (options: LabMcpOptions) {
  const notes = yield* NotesStore;
  const boards = yield* BoardStore;
  const folder = yield* FilmFolder;
  const events = yield* LabEvents;
  const films = yield* Effect.context<FilmFolder>();
  const { sets } = yield* setsReads(options);
  const { notesOf, boardOf } = yield* notesReads(options);

  const linksOf = (at: string) => linksAt(options.links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

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
          links: linksOf(pageHref.studio(film)),
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

  return { overview, events, notesOf, boardOf };
});

/** The overview's and the feed's handlers. */
const handlers = (options: LabMcpOptions) =>
  LabToolkit.toLayer(
    Effect.map(labReads(options), (lab) =>
      LabToolkit.of({
        overview: logged('overview', () => lab.overview),
        changes: logged('changes', ({ since, wait }) =>
          lab.events.wait(Option.fromUndefinedOr(since), Duration.seconds(wait ?? 0)),
        ),
      }),
    ),
  );

// ---------------------------------------------------------------------------
// Resources and the prompt

/** A read as a resource's JSON. */
const json = <S extends Schema.Top>(schema: S) =>
  Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }));

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
  "Hand the owner work to review as a guided review (`ask`): one page, a section per piece of material in the flow's order (script → concept → Board → voice → animatic → Rive scenes → sound → render → shorts), each the material itself in place (a script as a `script` block, never a `document` of its Markdown, and one script per ask; the Board, a video, a take, a set's document), then its questions, each a `choose` with your recommendation marked and its `why`; never a path, a link to elsewhere or prose describing what to open. Publish the files first as a set (`publish_set`) when the material is new, but a new script as a series draft (`series/<series>/scripts/<draft>.md`), named in a `script` block; reply on the note that asked for it.",
  "When a decision is the owner's, ask it (`ask`), each question a `choose` with one option `recommended` (an optional `free_text` beside it for anything else; words are a burden to require); hand the owner its page's link (`page.links`: asks you make while one of yours still asks join its page, so hand a page's link once), hear each answer on `changes` (`ask.step`, `ask.answered`) or wait on it in the background (`bun cli.ts ask wait <ask>`, or `--page <id>` for the whole page, from apps/animations, exits once he has answered), and `close_ask` each once acted on.",
  "When the owner has already decided in chat, file it on his production's timeline with `decide` (feedback that decides nothing, `note`), his own words verbatim as `quote`: never file a decision he did not make. What is still his to choose is an `ask`. Once he has given his word to move on and it is filed (in chat, or an ask he answered), `forward` moves the production to its next version on that decision, named by its `at`; with no decision of his in the version, or one it does not hold, it is refused.",
  'Read a film as the studio shows it with `timeline` (its lanes, flags, Next row and what waits on the owner). While you work on a film, say what you are doing on its header with `working` (one line, as `by`), and `done: true` when you finish.',
  EASEL_INSTRUCTIONS,
].join('\n\n');

/**
 * What the lab's MCP runs over beside its router: the lab's stores, its
 * change feed, its easel and its critic, its fresh runs of the film CLI,
 * the films' timelines and the agents' "doing now" lines.
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
  | Critic
  | FreshFilm
  | FilmTimelines
  | Working
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
    notesMcp(options),
    setsMcp(options),
    asksMcp(options),
    timelineMcp(options),
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
