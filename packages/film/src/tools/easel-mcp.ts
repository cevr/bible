// The easel's tools on the lab's MCP (`lab-mcp.ts`): what an agent paints a
// scene with, in any client that reaches the lab (Claude Code, Codex, gent):
//
// - `look`: stills of a scene as its files stand, drawn on the lab's warm
//   export page in this process (`Easel`, which `film look` asks over HTTP),
//   each answered as an image after its line (`lookLine`), so the model
//   reads the picture itself.
// - `cues`: each scene's placement, marks and named cues (`film read cues`).
// - `check`: scenes checked as drawn (`film check --draw`).
// - `journal`, `journal_note`: the film's journal read, and an observation
//   noted (`journal.ts`), a named scene first found in the film.
//
// The lab imports no film module (`lab.test.ts`), so whatever reads a film's
// modules (its clock, its check, its scene ids) runs the film CLI fresh
// (`FreshFilm`), as the lab's own after-write check does. Every tool takes
// `films`, the asker's films folder: a lab that serves another checkout
// refuses (`LabElsewhere`) rather than answer with that checkout's files.
// Each answer fits a client's result whole (`core/tool-pages.ts`); a refusal
// is a tool error in the film's own words, its tag first (`FilmRefused`).

import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { McpSchema, McpServer, Tool, Toolkit } from 'effect/ai';
import { PartId } from '../core/address-schema.ts';
import { ServerFailed } from '../core/api.ts';
import { type Look, LookMode, type LookPost, formatFor, lookLine } from '../core/easel.ts';
import {
  CheckPage,
  CuesPage,
  JournalPage,
  checkPage,
  clip,
  cuesPage,
  journalPage,
} from '../core/tool-pages.ts';
import { Easel, elsewhereOf } from './easel.ts';
import { CuesLate } from './errors.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { JOURNAL_LAST, note, read } from './journal.ts';

/** The most stills one look takes: each is an image the model reads, and a request keeps 20 at full size. */
const LOOK_MAX_PLACES = 8;

/**
 * The longest side a still may be asked at: the Claude API holds every image
 * of a request that carries more than 20 to 2,000 pixels a side, and a
 * painter's session carries many.
 */
const LOOK_MAX_SIZE = 2_000;

/** The most bytes one still may be: 5 MB once in base64, the most one image of a model's request may be. */
const STILL_MAX_BYTES = 3_750_000;

/** The most bytes one look's stills may be together: the request that carries them carries the rest of the session too. */
const LOOK_MAX_BYTES = 15_000_000;

/** The most characters of a refusal's words an answer keeps (a page that does not build says a lot). */
const REFUSAL_CHARS = 4_000;

/** How many entries `journal` reads at most. */
const JOURNAL_MAX_LAST = 200;

/** A film tool's refusal: the film's own failure (`UnknownScene`, `PagesBroken`, `LabElsewhere`, …) and its words. */
class FilmRefused extends Schema.TaggedError<FilmRefused>()('FilmRefused', {
  tag: Schema.String,
  text: Schema.String,
}) {
  override get message() {
    return `${this.tag}: ${this.text}`;
  }
}

/** A look whose stills are too large for a model's request: each one too large, and the limit it passed. */
class LookTooLarge extends Schema.TaggedError<LookTooLarge>()('LookTooLarge', {
  stills: Schema.Array(Schema.Struct({ file: Schema.String, bytes: Schema.Int })),
  limit: Schema.Int,
}) {
  override get message() {
    const files = this.stills.map((s) => `${s.file} (${s.bytes} bytes)`).join(', ');
    return `the stills pass ${this.limit} bytes, more than a model's request takes: ${files}. They are written; look again with a smaller size, a smaller crop or fewer places`;
  }
}

/** A failure the lab names: its tag and its words. */
interface Named {
  readonly _tag: string;
  readonly message: string;
}

const isServerFailed = Schema.is(ServerFailed);

/**
 * `error` as the tool answers it: the film's tag and words (a fresh run's
 * failure by the tag it carries), cut to a refusal's length; a lab that
 * serves another checkout says how to reach one that serves the asker's.
 */
const refusedAs = (error: Named): FilmRefused => {
  if (isServerFailed(error))
    return FilmRefused.make({ tag: error.tag, text: clip(error.reason, REFUSAL_CHARS) });
  if (error._tag === 'LabElsewhere')
    return FilmRefused.make({
      tag: error._tag,
      text: `${error.message.replace(/: start a lab .*$/, '')}: start a lab from your checkout (LAB_PORT=<port> bun cli.ts lab, in apps/animations) and call its MCP at http://127.0.0.1:<port>/mcp`,
    });
  return FilmRefused.make({ tag: error._tag, text: clip(error.message, REFUSAL_CHARS) });
};

// ---------------------------------------------------------------------------
// What the tools take

const Films = Schema.String.annotate({
  description:
    "Your checkout's films folder, absolute (<repo>/apps/animations/src/films): a lab that serves another checkout's refuses (LabElsewhere)",
});

const FilmParam = Schema.String.annotate({
  description: 'The film, by name: a folder in the films folder',
});

const SceneParam = PartId.annotate({ description: "A scene, by its id (the script's beat id)" });

const LookParams = Schema.Struct({
  films: Films,
  film: FilmParam,
  scene: SceneParam,
  at: Schema.NonEmptyArray(Schema.String)
    .check(Schema.isMaxLength(LOOK_MAX_PLACES))
    .annotate({
      description: `Where in the scene, 1 to ${LOOK_MAX_PLACES} places, a still each: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>] (a share of the cue, 0 its start)`,
    }),
  crop: Schema.optionalKey(
    Schema.Tuple([Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite]).annotate({
      description:
        '[x0, y0, x1, y1] in canvas pixels: that region at 1:1 (a face, a hand, lettering), as a PNG',
    }),
  ),
  size: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: LOOK_MAX_SIZE })).annotate({
      description: `The still's long side in pixels (16 to ${LOOK_MAX_SIZE})`,
    }),
  ),
  mode: Schema.optionalKey(
    LookMode.annotate({
      description:
        'plain (the default); value (greys: the light and dark alone); squint (greys, blurred: the big masses, where the eye lands first)',
    }),
  ),
});
type LookParams = typeof LookParams.Type;
const decodeLookParams = Schema.decodeUnknownEffect(LookParams);

const JournalNoted = Schema.Struct({
  file: Schema.String,
  /** When it was noted: ISO 8601, to the second, UTC. */
  at: Schema.String,
  /** Its scene, or `film` for the whole film. */
  scene: Schema.String,
});

// ---------------------------------------------------------------------------
// The tools

const CheckTool = Tool.make('check', {
  description:
    "Check a film's scenes as their files stand (film check --draw): the static leg (cues, sounds) and each scene drawn by its own code in the check's process, no browser (a throw, a frame that is not pure, ink over a face). Stale takes count as warnings: a painter never narrates. `scenes` checks those (adjacent ones play one after another); without it, the whole film, which takes minutes for a long one. The findings come a page at a time, errors first: when the answer has `next`, check again with its `from` and `report` for the rest; findings that changed in between are listed again from the first (`restarted`). A check that cannot run (an unknown scene, a film that does not lay out) is its one error finding.",
  parameters: Schema.Struct({
    films: Films,
    film: FilmParam,
    scenes: Schema.optionalKey(
      Schema.NonEmptyArray(SceneParam).annotate({ description: 'The scenes to check' }),
    ),
    from: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
        description: "The first finding to list: an earlier answer's next.from (0)",
      }),
    ),
    report: Schema.optionalKey(
      Schema.String.annotate({
        description: "The report that `from` is a place in: an earlier answer's next.report",
      }),
    ),
  }),
  success: CheckPage,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

const CuesTool = Tool.make('cues', {
  description:
    "A film's clock as its files stand (film cues): a line per scene with its start=, dur=, speech= and seam= to the next voice, each {mark} at its film second, then `| cues:` each named cue's span; `scene`'s line alone when given. `late` says a cue ends after its scene. Lines come whole: when the answer has `next`, ask again with its `from` and `column` (a column past 1 goes on inside a line).",
  parameters: Schema.Struct({
    films: Films,
    film: FilmParam,
    scene: Schema.optionalKey(SceneParam),
    from: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The line to start at (1): an earlier answer's next.from",
      }),
    ),
    column: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The character of that line to start at (1): an earlier answer's next.column",
      }),
    ),
  }),
  success: CuesPage,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

const JournalTool = Tool.make('journal', {
  description: `A film's journal (src/films/<film>/journal.md, committed with the film): what was seen, heard or measured while it was made, oldest first, a line each (<time> scene=<id> <words>): the newest \`last\` (${JOURNAL_LAST}), \`scene\`'s alone when given. Read it before working on a scene.`,
  parameters: Schema.Struct({
    films: Films,
    film: FilmParam,
    scene: Schema.optionalKey(SceneParam),
    last: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: JOURNAL_MAX_LAST })).annotate({
        description: `How many of the newest entries to read (${JOURNAL_LAST})`,
      }),
    ),
  }),
  success: JournalPage,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

const JournalNoteTool = Tool.make('journal_note', {
  description:
    "Note one observation in a film's journal, of `scene` (the whole film without one), at the time now: what a look taught (a mass that reads or does not, a hand over a face, a word that lands late, a judge's verdict), what is, never what to do. A decision lands in the source and a request for the owner is a lab note, never an entry. One line; commit journal.md with the scene work it came from.",
  parameters: Schema.Struct({
    films: Films,
    film: FilmParam,
    text: Schema.String.annotate({ description: 'The observation, on one line' }),
    scene: Schema.optionalKey(SceneParam),
  }),
  success: JournalNoted,
  failure: FilmRefused,
});

const EaselToolkit = Toolkit.make(CheckTool, CuesTool, JournalTool, JournalNoteTool);

/** The `look` tool as the lab lists it: its answer is images, which a toolkit's JSON answer cannot carry. */
const LOOK_DESCRIPTION = `Look at a scene as its files stand now: stills drawn on the lab's warm export page in about a second (no render), each answered as an image after its line (its file, scene, place, time in the scene, frame, size and the lab's build). Look at the moments the beat is about: its marks and the middle of each cue that moves something (mark:<m>, cue:<c>@0.5). \`mode\` value checks the light and dark, squint where the eye lands first; \`crop\` reads a face, a hand or lettering at 1:1 (a PNG; a whole frame is a JPEG). The stills stay under out/<film>/look/<scene>/. A look never shows stale code: a page that does not build is PagesBroken, with the bundler's words.`;

// ---------------------------------------------------------------------------
// The work, over the lab's easel, its fresh runs and its films

const easelWork = Effect.gen(function* () {
  const easel = yield* Easel;
  const fresh = yield* FreshFilm;
  const folder = yield* FilmFolder;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const films = yield* Effect.context<FilmFolder | FileSystem.FileSystem | Path.Path>();

  /** `film` as one the lab serves from the asker's films folder `from`: another checkout's is `LabElsewhere`. */
  const served = Effect.fn('EaselMcp.served')(function* (from: string, film: string) {
    const elsewhere = elsewhereOf(path, folder.paths(film).dir, from, film);
    if (Option.isSome(elsewhere)) return yield* elsewhere.value;
    return yield* filmNamed(film).pipe(Effect.provideContext(films));
  });

  /** `scene` as one of `film`'s, when it names one: the film's own refusal (`UnknownScene`) when not. */
  const sceneOf = (film: FilmName, scene: Option.Option<string>) =>
    Option.match(scene, {
      onNone: () => Effect.void,
      onSome: () => Effect.asVoid(fresh.cues(film, scene)),
    });

  const check = Effect.fn('EaselMcp.check')(function* (
    params: typeof CheckTool.parametersSchema.Type,
  ) {
    const film = yield* served(params.films, params.film);
    return checkPage(yield* fresh.check(film, 'draw', params.scenes ?? []), params);
  });

  const cues = Effect.fn('EaselMcp.cues')(function* (
    params: typeof CuesTool.parametersSchema.Type,
  ) {
    const film = yield* served(params.films, params.film);
    const read = yield* fresh.cues(film, Option.fromUndefinedOr(params.scene));
    const late = Option.map(
      Option.liftPredicate(read.late, (count) => count > 0),
      (count) => CuesLate.make({ count }).message,
    );
    return cuesPage(read.lines, late, params);
  });

  const journal = Effect.fn('EaselMcp.journal')(function* (
    params: typeof JournalTool.parametersSchema.Type,
  ) {
    const film = yield* served(params.films, params.film);
    const scene = Option.fromUndefinedOr(params.scene);
    yield* sceneOf(film, scene);
    const page = yield* read(
      film,
      scene,
      params.last ?? JOURNAL_LAST,
      Number.MAX_SAFE_INTEGER,
    ).pipe(Effect.provideContext(films));
    return journalPage(page.file, page.lines, page.left);
  });

  const journalNote = Effect.fn('EaselMcp.journalNote')(function* (
    params: typeof JournalNoteTool.parametersSchema.Type,
  ) {
    const film = yield* served(params.films, params.film);
    const scene = Option.fromUndefinedOr(params.scene);
    yield* sceneOf(film, scene);
    const noted = yield* note(film, params.text, scene).pipe(Effect.provideContext(films));
    return { file: noted.file, at: noted.entry.at, scene: noted.entry.scene };
  });

  /**
   * Each still a look wrote, read back beside it: refused whole when one, or
   * all of them, would pass what a model's request takes.
   */
  const stillsOf = Effect.fn('EaselMcp.stills')(function* (looks: ReadonlyArray<Look>) {
    const read = yield* Effect.forEach(looks, (one) =>
      Effect.map(fs.readFile(one.file), (bytes) => ({ look: one, bytes })),
    );
    const sized = read.map((still) => ({ file: still.look.file, bytes: still.bytes.length }));
    const large = sized.filter((still) => still.bytes > STILL_MAX_BYTES);
    if (Arr.isReadonlyArrayNonEmpty(large))
      return yield* LookTooLarge.make({ stills: large, limit: STILL_MAX_BYTES });
    if (sized.reduce((sum, still) => sum + still.bytes, 0) > LOOK_MAX_BYTES)
      return yield* LookTooLarge.make({ stills: sized, limit: LOOK_MAX_BYTES });
    return read;
  });

  const look = Effect.fn('EaselMcp.look')(function* (params: LookParams) {
    const film = yield* served(params.films, params.film);
    const crop = Option.fromUndefinedOr(params.crop);
    const view: LookPost['view'] = {
      ...Option.match(crop, { onNone: () => ({}), onSome: (c) => ({ crop: c }) }),
      ...Option.match(Option.fromUndefinedOr(params.size), {
        onNone: () => ({}),
        onSome: (s) => ({ size: s }),
      }),
      mode: params.mode ?? 'plain',
      captions: false,
      format: formatFor(Option.isSome(crop)),
    };
    const taken = yield* easel.look(film, {
      scene: params.scene,
      at: params.at,
      view,
      from: params.films,
    });
    const stills = yield* stillsOf(taken.looks);
    return stills.flatMap(({ look: one, bytes }): ReadonlyArray<McpSchema.ContentBlock> => [
      { type: 'text', text: lookLine(one, taken.build) },
      { type: 'image', data: bytes, mimeType: view.format },
    ]);
  });

  return { check, cues, journal, journalNote, look };
});

/** The toolkit's handlers: each tool's work, its failure said as the film's refusal. */
const handlers = EaselToolkit.toLayer(
  Effect.map(easelWork, (work) =>
    EaselToolkit.of({
      check: (params) => Effect.mapError(work.check(params), refusedAs),
      cues: (params) => Effect.mapError(work.cues(params), refusedAs),
      journal: (params) => Effect.mapError(work.journal(params), refusedAs),
      journal_note: (params) => Effect.mapError(work.journalNote(params), refusedAs),
    }),
  ),
);

/**
 * `look`, registered by hand: a toolkit answers its result as JSON text, and
 * a look answers images. Its arguments are decoded as a toolkit's are (bad
 * ones are the call's `InvalidParams`); a refusal is the tool's error, in the
 * same words `FilmRefused` says.
 */
const lookTool = Layer.effectDiscard(
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const work = yield* easelWork;
    const document = Schema.toJsonSchemaDocument(LookParams, { onExcessProperty: 'ignore' });
    const inputSchema = yield* Schema.decodeUnknownEffect(McpSchema.ToolJson)({
      ...document.schema,
      $defs: document.definitions,
    }).pipe(Effect.orDie);
    yield* server.addTool({
      tool: McpSchema.Tool.make({
        name: 'look',
        description: LOOK_DESCRIPTION,
        inputSchema,
        // It writes its stills under out/ and nothing else, and reaches nothing past the lab.
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      }),
      annotations: Context.empty(),
      handle: (payload) =>
        decodeLookParams(payload).pipe(
          Effect.mapError((error) => McpSchema.InvalidParams.make({ message: error.message })),
          Effect.flatMap((params) =>
            work.look(params).pipe(
              Effect.map((content) => McpSchema.CallToolResult.make({ content })),
              Effect.catch((error) =>
                Effect.succeed(
                  McpSchema.CallToolResult.make({
                    isError: true,
                    content: [{ type: 'text', text: refusedAs(error).message }],
                  }),
                ),
              ),
            ),
          ),
        ),
    });
  }),
).pipe(Layer.provide(McpServer.McpServer.layer));

/** What the lab's MCP says of the easel's tools, beside its own instructions. */
export const EASEL_INSTRUCTIONS =
  "Paint and review a film's scenes with the easel's tools: `look` (stills of a scene as its files stand, as images), `cues` (each scene's marks and named cues), `check` (scenes checked as drawn), `journal` and `journal_note` (the film's observations, read and noted). Each takes `films`, your checkout's films folder: a lab that serves another checkout's refuses (`LabElsewhere`).";

/** The easel's tools on the lab's MCP, over the lab's easel, its fresh runs and its films. */
export const easelMcp = Layer.mergeAll(
  McpServer.toolkit(EaselToolkit).pipe(Layer.provideMerge(handlers)),
  lookTool,
);
