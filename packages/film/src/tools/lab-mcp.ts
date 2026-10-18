// The lab as an MCP server, for agents: the running lab answers MCP at
// `/mcp` (Streamable HTTP, Effect's `McpServer`), so an agent reads what
// the owner said and kept in the lab, acts on it, and hears of each change
// as it happens, instead of reading files and handing links back and forth.
//
// Its tools are the lab's command set (`lab-commands.ts`), each served from
// its one definition (`lab-command.ts`): its arguments decoded by its
// parameters (bad ones are the call's `InvalidParams`), its answer encoded by
// its success as the structured answer and as JSON text (or, for a command
// whose answer is pictures, its lines and images beside the structured
// answer), its refusal said in its words, and each call logged once
// (`mcp-calls.ts`). `film lab <name>` is made from the same definitions
// (`lab-cli.ts`), so a terminal and an agent take the same actions by the
// same names. Every write goes through the store the page writes through,
// so there is no second write path.
//
// Resources (`lab://…`) say the same reads for a client that attaches them;
// the `inbox` prompt opens a session on what waits.
//
// The lab is reached on loopback and from the owner's phone over the
// tailnet (the lab listens on that address itself), and nowhere else, so
// `/mcp` asks no token (owner, 2026-10-14: secure by obscurity). The lab's
// gate (`api-server.ts`) runs first, as for any path, and Effect's server
// refuses a request with a foreign `Origin`.

import { Array as Arr, Cause, Context, Effect, Layer, Option, Schema } from 'effect';
import { McpProtocol, McpSchema, McpServer, Tool } from 'effect/ai';
import { gist } from '../core/lab-events.ts';
import { EASEL_INSTRUCTIONS } from './easel-mcp.ts';
import { objectSchema } from './lab-fields.ts';
import type { Answered, LabAddress, LabCommand } from './lab-command.ts';
import { type InLabNeeds, OverviewRead, allCommands, overviewRead } from './lab-commands.ts';
import { LabChanges, LabEvents } from './lab-events.ts';
import { type CallParams, callParamsOf, logged } from './mcp-calls.ts';
import { eventsRoute } from './mcp-events.ts';
import { BoardRead, type NoteRead, NotesRead, notesReads } from './notes-mcp.ts';

export const MCP_PATH = '/mcp';

// ---------------------------------------------------------------------------
// A command as a tool

const errorResult = (text: string) =>
  McpSchema.CallToolResult.make({ isError: true, content: [{ type: 'text', text }] });

/** A failure that is no refusal of the command's (a defect), logged and said plainly. */
const INTERNAL = 'Tool execution failed due to an internal server error.';

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
const readPayload = Schema.decodeUnknownEffect(Schema.Json);

/** A call's answer as a toolkit says it: the structured answer and its JSON text, or the command's pictures beside it. */
const resultOf = (answered: Answered) =>
  Effect.map(
    Option.getOrElse(answered.pictured, () =>
      Effect.succeed<ReadonlyArray<McpSchema.ContentBlock>>([
        { type: 'text', text: jsonText(answered.json) },
      ]),
    ),
    (content) =>
      McpSchema.CallToolResult.make({ structuredContent: answered.json, content: [...content] }),
  );

/**
 * `command` registered on the server, over `services`: its call read, run,
 * logged once, and answered as a toolkit answers. Input that does not read
 * is the call's `InvalidParams`; a refusal is an error result in its words.
 */
const registered = (command: LabCommand<InLabNeeds>, services: Context.Context<InLabNeeds>) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const { tool, name } = command;
    const inputSchema = yield* Schema.decodeUnknownEffect(McpSchema.ToolJson)(
      objectSchema(tool.parametersSchema),
    ).pipe(Effect.orDie);
    const outputSchema = yield* Schema.decodeUnknownEffect(McpSchema.ToolOutputJson)(
      objectSchema(tool.successSchema),
    ).pipe(Effect.orDie);
    const run = logged(name, (_: CallParams, raw: Schema.Json) =>
      Effect.flatMap(command.call(raw), resultOf),
    );
    yield* server.addTool({
      tool: McpSchema.Tool.make({
        name,
        description: Tool.getDescription(tool),
        inputSchema,
        outputSchema,
        annotations: {
          readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
          destructiveHint: Context.get(tool.annotations, Tool.Destructive),
          idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
          openWorldHint: Context.get(tool.annotations, Tool.OpenWorld),
        },
      }),
      annotations: Context.empty(),
      handle: (payload) =>
        readPayload(Option.getOrElse(Option.fromNullishOr(payload), () => ({}))).pipe(
          Effect.mapError((error) => McpSchema.InvalidParams.make({ message: error.message })),
          Effect.flatMap((raw) =>
            run(callParamsOf(raw), raw).pipe(
              Effect.provideContext(services),
              Effect.catchTags({
                LabInputInvalid: (error) =>
                  Effect.fail(McpSchema.InvalidParams.make({ message: error.message })),
                LabCommandRefused: (error) => Effect.succeed(errorResult(error.reason)),
              }),
              Effect.catchDefect((defect) =>
                Effect.as(Effect.logError(Cause.die(defect)), errorResult(INTERNAL)),
              ),
            ),
          ),
        ),
    });
  });

/** Every command of the set as a tool of the lab's MCP. */
const commandTools = Layer.effectDiscard(
  Effect.gen(function* () {
    const services = yield* Effect.context<InLabNeeds>();
    yield* Effect.forEach(allCommands, (command) => registered(command, services), {
      discard: true,
    });
  }),
).pipe(Layer.provide(McpServer.McpServer.layer));

// ---------------------------------------------------------------------------
// Resources and the prompt

/** A read as a resource's JSON. */
const json = <S extends Schema.Top>(schema: S) =>
  Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }));

const filmParam = McpSchema.param('film', Schema.String);

/** The lab's reads as resources: what a client attaches by `@lab:lab://…`. */
const resources = (() => {
  const reads = Effect.gen(function* () {
    const events = yield* LabEvents;
    const { notesOf, boardOf } = yield* notesReads();
    return { overview: overviewRead, events, notesOf, boardOf };
  });
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
})();

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

const inbox = McpServer.prompt({
  name: 'inbox',
  title: 'What waits in the lab',
  description:
    "The owner's notes that wait across every film, and how to work them through the lab.",
  content: () =>
    Effect.gen(function* () {
      const overview = yield* overviewRead;
      const { notesOf } = yield* notesReads();
      const waiting = yield* Effect.forEach(overview.films, (f) =>
        Effect.map(notesOf(f.film, 'unresolved'), (n) => n.notes),
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
 * What the lab's MCP runs over beside its router, its change feed and its
 * address: the lab's stores, its easel and its critic, its fresh runs of the
 * film CLI, the films' timelines and the agents' "doing now" lines.
 */
export type LabMcpNeeds = Exclude<InLabNeeds, LabEvents | LabAddress>;

/**
 * The lab's MCP at `/mcp` on the lab's router, over its stores and its change
 * feed. The routes it adds are the lab's own: the gate (`api-server.ts`)
 * runs first, as for every path. A client ends its session with a DELETE
 * (the transport keeps a session until then: it has no expiry).
 */
export const labMcp = Layer.mergeAll(commandTools, resources, inbox, eventsRoute(MCP_PATH)).pipe(
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
