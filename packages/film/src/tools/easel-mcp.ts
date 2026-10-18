// The easel's commands (`lab-command.ts`; MCP and `film lab` serve them):
// what an agent paints a scene with, in any client that reaches the lab
// (Claude Code, Codex, gent), or from a terminal:
//
// - `look`: stills of a scene as its files stand, drawn on the lab's warm
//   export page (`Easel`, in the lab alone), each answered on MCP as an
//   image after its line (`lookLine`), so the model reads the picture
//   itself; in a terminal, its lines.
// - `match`: a scene's figures at one place held against their concepts
//   (`Easel.match`): per figure its table and its side-by-side.
// - `critique`: the same match, then each figure's two crops shown at 1:1 to
//   a fresh model (`Critic`): per figure its findings, a skip said and never
//   a refusal.
// - `cues`: each scene's placement, marks and named cues (`film read cues`).
// - `check`: scenes checked as drawn (`film check --draw`).
// - `journal`, `journal_note`: the film's journal read, and an observation
//   noted (`journal.ts`), a named scene first found among the film's
//   (`film read scenes`, which resolves no timeline: a scene that does not
//   lay out never keeps a painter from its journal).
//
// The lab imports no film module (`lab.test.ts`), so whatever reads a film's
// modules (its clock, its check, its scene ids) runs the film CLI fresh
// (`FreshFilm`), as the lab's own after-write check does. Every tool takes
// `films`, the asker's films folder, absolute and with no `..`: a lab that
// serves another checkout refuses (`LabElsewhere`, the folders compared as
// the file system resolves them) rather than answer with that checkout's
// files, and a relative folder, or one with a `..`, is refused
// (`plainAbsolute`): the lab would resolve the one in its own checkout, and
// Node's `realpath` takes the other before the links it follows. Each answer
// fits a client's result whole (`core/tool-pages.ts`): one that stops early
// answers `next`, which repeats what was asked of the film (`scenes`,
// `scene`), so asking again with it reads on in the same answer; a refusal
// is a tool error in the film's own words, its tag first (`FilmRefused`).

import { Array as Arr, Boolean as Bool, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { type McpSchema, Tool } from 'effect/ai';
import { PartId } from '../core/address-schema.ts';
import { ServerFailed } from '../core/api.ts';
import { LookMode, type LookPost, LookTaken, formatFor, lookLine } from '../core/easel.ts';
import { MatchTaken, matchLines } from '../core/match.ts';
import {
  CHECK_MAX_SCENES,
  CheckPage,
  CuesPage,
  JournalPage,
  SCENE_ID_CHARS,
  checkPage,
  clip,
  cuesPage,
  journalPage,
} from '../core/tool-pages.ts';
import { UnknownScene } from '../core/errors.ts';
import { Critic, CritiqueTaken } from './critique.ts';
import { Easel, elsewhereOf, plainAbsolute } from './easel.ts';
import { CuesLate } from './errors.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { JOURNAL_LAST, note, read } from './journal.ts';
import { labCommand } from './lab-command.ts';

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
      text: `${error.message.replace(/: start a lab .*$/, '')}: start a lab from your checkout (LAB_PORT=<port> bun cli.ts lab, in apps/animations) and call its MCP at http://localhost:<port>/mcp`,
    });
  return FilmRefused.make({ tag: error._tag, text: clip(error.message, REFUSAL_CHARS) });
};

// ---------------------------------------------------------------------------
// What the tools take

const Films = Schema.String.check(
  Schema.makeFilter(
    (films) =>
      plainAbsolute(films) ||
      "your checkout's films folder, absolute and with no .. (<repo>/apps/animations/src/films): the lab would resolve a relative one in its own checkout, and Node takes a .. before the links it follows",
  ),
).annotate({
  description:
    "Your checkout's films folder, absolute and with no .. (<repo>/apps/animations/src/films): a lab that serves another checkout's refuses (LabElsewhere)",
});

const FilmParam = Schema.String.annotate({
  description: 'The film, by name: a folder in the films folder',
});

const SceneParam = PartId.check(Schema.isMaxLength(SCENE_ID_CHARS)).annotate({
  description: "A scene, by its id (the script's beat id)",
});

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
  captions: Schema.optionalKey(
    Schema.Boolean.annotate({ description: 'Burn the captions in (false)' }),
  ),
  format: Schema.optionalKey(
    Schema.Literals(['png', 'jpeg']).annotate({
      description:
        'png (lossless) or jpeg (0.95); unless told, a crop is png and a whole frame jpeg (a whole frame as png is about 4 MB)',
    }),
  ),
  levels: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description:
        "A wedge: each look named (palette.ts's looks) drawn at the level given, not the one it plays, the pick unwritten: { <look>: <level> }",
    }),
  ),
});
type LookParams = typeof LookParams.Type;

const MatchParams = Schema.Struct({
  films: Films,
  film: FilmParam,
  scene: SceneParam,
  at: Schema.String.annotate({
    description:
      "Where in the scene, one place: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>]",
  }),
  figure: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "One figure, by its rig's name (lead) or key; every figure the frame draws with a concept when left out",
    }),
  ),
});
type MatchParams = typeof MatchParams.Type;

/** The `critique` tool as the lab lists it: its answer is each figure's findings, as text. */
const CRITIQUE_DESCRIPTION = `Match a scene's figures at one place (as \`match\` does), then show each figure's concept crop and scene crop at 1:1 to a fresh Opus (headless Claude at max effort, sandboxed, Read its one tool) beside the match's flagged rows and the app's figure rules (the K1 look, the grammar every figure shares, figures and faces, the look): it names each difference in head angle and turn, face shape and features, pose, proportion (never height in heads: that is the cast's band), palette and artifacts. One counsel run answers every figure at the place; the answer is kept by the hash of the prompt and the crops, so the same prompt over the same crops is never asked twice. Answers per figure its findings, written beside the match's table (<stem>.critique.md under out/<film>/match/<scene>/), and each finding rejected (one that does not read, or names no figure asked about). It fails open: a counsel that fails or dies, or answers no json block, is a skip, said and logged, never a refusal. Before a figure is called done, and before an owner look, critique it; a finding is fixed or said why not (\`film review\`).`;

/** A critique's answer: the match it critiqued, and the critique. */
const Critiqued = Schema.Struct({ match: MatchTaken, critique: CritiqueTaken });
type Critiqued = typeof Critiqued.Type;

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
    "Check a film's scenes as their files stand (film check --draw): the static leg (cues, sounds) and each scene drawn by its own code in the check's process, no browser (a throw, a frame that is not pure, ink over a face). Stale takes count as warnings: a painter never narrates. `scenes` checks those (adjacent ones play one after another); without it, the whole film, which takes minutes for a long one. The findings come a page at a time, errors first: when the answer has `next`, check again with `next` as it is (its `from`, its `report`, and the `scenes` asked) for the rest; findings that changed in between are listed again from the first (`restarted`). A check that cannot run (an unknown scene, a film that does not lay out) is its one error finding.",
  parameters: Schema.Struct({
    films: Films,
    film: FilmParam,
    scenes: Schema.optionalKey(
      Schema.NonEmptyArray(SceneParam)
        .check(Schema.isMaxLength(CHECK_MAX_SCENES))
        .annotate({
          description: `The scenes to check, at most ${CHECK_MAX_SCENES} (check more in turn, or the whole film)`,
        }),
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
    "A film's clock as its files stand (film cues): a line per scene with its start= (its first second in the film) and dur=, its speech= span in seconds into the scene, seam= (how long the pause to the next scene's voice lasts), each mark@second into the scene, and `| cues:` each named cue's span in seconds into the scene; `scene`'s line alone when given. `late` says a cue ends after its scene. Lines come whole: when the answer has `next`, ask again with `next` as it is (its `from` and `column`, and the `scene` asked; a column past 1 goes on inside a line).",
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

/** The `look` tool as the lab lists it. */
const LOOK_DESCRIPTION = `Look at a scene as its files stand now: stills drawn on the lab's warm export page in about a second (no render), each answered as an image after its line (its file, scene, place, time in the scene, frame, size and the lab's build). Look at the moments the beat is about: its marks and the middle of each cue that moves something (mark:<m>, cue:<c>@0.5). \`mode\` value checks the light and dark, squint where the eye lands first; \`crop\` reads a face, a hand or lettering at 1:1 (a PNG; a whole frame is a JPEG). The stills stay under out/<film>/look/<scene>/. A look never shows stale code: a page that does not build is PagesBroken, with the bundler's words.`;

/** The `match` tool as the lab lists it. */
const MATCH_DESCRIPTION = `Hold a scene's figures against their concepts at one place, as the files stand now (the look's warm page, its build and stale-code guarantees): each rig with a concept (its RivePropSpec's \`concept\`: an image and the figure's box in it) is cropped from the frame by the box the engine draws it in and measured as its concept is: head height, jaw, the body under the chin, at 0.35 and 0.7 and at the hem, height in heads, hand, eyes, brows, mouth, outline width, feet width and height (each a share of the head's width), ink on the hair/skin edge (the rule is none), a light rim inside an inner part such as an ear (flagged where the concept paints none), the head's and the body's shading (value drop, hue turn, saturation kept, the edge's angle, colour not grey), the head's facing (its turn: the eyes in the face; its roll: the eye line's slope; a concept's angle is design, so a turn past 0.1 or a roll past 6° and the eyes' grain is flagged), the render's artifacts on the head at 1:1 (a seam: a light line between two fills; a sliver: a fill short of the outline; weather over the face; the rule is none), and the outline: the head's shape, the body's sides and the feet shown or not, against the concept's. Answers per figure its table (concept, scene, difference; a ratio flagged past 5%, the head's outline past a mean gap of 0.03 of a head, the body's past 0.05) and one side-by-side image at one head height: the concept, the scene with each artifact ringed (a seam red, a sliver blue, weather green), and the scene under the concept's outline in magenta; both stay under out/<film>/match/<scene>/. Guidance, not a gate: a concept is painted. After a passage that touches a figure, match it.`;

const LookTool = Tool.make('look', {
  description: LOOK_DESCRIPTION,
  parameters: LookParams,
  success: LookTaken,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

const MatchTool = Tool.make('match', {
  description: MATCH_DESCRIPTION,
  parameters: MatchParams,
  success: MatchTaken,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

const CritiqueTool = Tool.make('critique', {
  description: CRITIQUE_DESCRIPTION,
  parameters: MatchParams,
  success: Critiqued,
  failure: FilmRefused,
}).annotate(Tool.Readonly, true);

// ---------------------------------------------------------------------------
// The work, over the lab's easel, its fresh runs and its films

/** `film` as one the lab serves from the asker's films folder `from`: another checkout's is `LabElsewhere`. */
const served = Effect.fn('EaselMcp.served')(function* (from: string, film: string) {
  const folder = yield* FilmFolder;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const elsewhere = yield* elsewhereOf(fs, path, folder.paths(film).dir, from, film);
  if (Option.isSome(elsewhere)) return yield* elsewhere.value;
  return yield* filmNamed(film);
});

/**
 * `scene` as one of `film`'s, when it names one, as the journal finds it (no
 * timeline resolved): `UnknownScene`, naming the film's, when not.
 */
const sceneOf = Effect.fn('EaselMcp.sceneOf')(function* (
  film: FilmName,
  scene: Option.Option<string>,
) {
  if (Option.isNone(scene)) return;
  const known = yield* (yield* FreshFilm).scenes(film);
  if (!known.includes(scene.value)) return yield* UnknownScene.make({ scene: scene.value, known });
});

/** A still as MCP shows it: its file read back, refused when it is past what a model's request takes. */
const imagesOf = Effect.fn('EaselMcp.images')(function* (
  files: ReadonlyArray<string>,
  together: number,
) {
  const fs = yield* FileSystem.FileSystem;
  const read = yield* Effect.forEach(files, (file) =>
    Effect.map(fs.readFile(file), (bytes) => ({ file, bytes })),
  );
  const sized = read.map((still) => ({ file: still.file, bytes: still.bytes.length }));
  const large = sized.filter((still) => still.bytes > STILL_MAX_BYTES);
  if (Arr.isReadonlyArrayNonEmpty(large))
    return yield* LookTooLarge.make({ stills: large, limit: STILL_MAX_BYTES });
  if (sized.reduce((sum, still) => sum + still.bytes, 0) > together)
    return yield* LookTooLarge.make({ stills: sized, limit: together });
  return read;
});

const FORMATS = { png: 'image/png', jpeg: 'image/jpeg' } as const;

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
    captions: params.captions ?? false,
    format: Option.match(Option.fromUndefinedOr(params.format), {
      onNone: () => formatFor(Option.isSome(crop)),
      onSome: (f) => FORMATS[f],
    }),
  };
  return yield* (yield* Easel).look(film, {
    scene: params.scene,
    at: params.at,
    view,
    from: params.films,
    ...Option.match(Option.fromUndefinedOr(params.levels), {
      onNone: () => ({}),
      onSome: (levels) => ({ levels }),
    }),
  });
});

/** A look's answer as MCP shows it: each still's line, then the still. */
const lookContent = (taken: LookTaken) =>
  Effect.map(
    imagesOf(
      taken.looks.map((one) => one.file),
      LOOK_MAX_BYTES,
    ),
    (read) =>
      Arr.zip(taken.looks, read).flatMap(
        ([one, { bytes }]): ReadonlyArray<McpSchema.ContentBlock> => [
          { type: 'text', text: lookLine(one, taken.build) },
          {
            type: 'image',
            data: bytes,
            mimeType: Bool.match(one.file.endsWith('.png'), {
              onTrue: () => 'image/png',
              onFalse: () => 'image/jpeg',
            }),
          },
        ],
      ),
  );

const matched = Effect.fn('EaselMcp.match')(function* (params: MatchParams) {
  const film = yield* served(params.films, params.film);
  return yield* (yield* Easel).match(film, {
    scene: params.scene,
    at: params.at,
    figure: params.figure,
    from: params.films,
  });
});

/** A match's first line. Pure. */
const matchHead = (taken: MatchTaken): string =>
  `match scene=${taken.scene} at=${taken.at} t=${taken.time.toFixed(2)} frame=${taken.frame} build=${taken.build}`;

const unmatchedLines = (taken: MatchTaken): ReadonlyArray<string> =>
  taken.unmatched.map((one) => `${one.figure}: unmatched (${one.reason})`);

/** A match's answer as MCP shows it: its head, then per figure its table and its side-by-side. */
const matchContent = Effect.fn('EaselMcp.matchContent')(function* (taken: MatchTaken) {
  const fs = yield* FileSystem.FileSystem;
  const sides = yield* imagesOf(
    taken.figures.map((one) => one.side),
    Number.MAX_SAFE_INTEGER,
  );
  const tables = yield* Effect.forEach(taken.figures, (one) => fs.readFileString(one.table));
  return [
    { type: 'text', text: matchHead(taken) },
    ...taken.figures.flatMap((one, i): ReadonlyArray<McpSchema.ContentBlock> => [
      { type: 'text', text: `${one.side}\n${tables[i] ?? ''}` },
      { type: 'image', data: sides[i]?.bytes ?? new Uint8Array(), mimeType: 'image/png' },
    ]),
    ...unmatchedLines(taken).map((text): McpSchema.ContentBlock => ({ type: 'text', text })),
  ] satisfies ReadonlyArray<McpSchema.ContentBlock>;
});

const critiqued = Effect.fn('EaselMcp.critique')(function* (params: MatchParams) {
  const match = yield* matched(params);
  return { match, critique: yield* (yield* Critic).critique(match) };
});

/** A critique's first line. Pure. */
const critiqueHead = ({ match, critique }: Critiqued): string =>
  `critique scene=${match.scene} at=${match.at} t=${match.time.toFixed(2)} build=${match.build} cached=${critique.cached}`;

/** A critique's answer as MCP shows it: its head, then each figure's findings as its file says them. */
const critiqueContent = Effect.fn('EaselMcp.critiqueContent')(function* (taken: Critiqued) {
  const fs = yield* FileSystem.FileSystem;
  const head = [
    critiqueHead(taken),
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(taken.critique.skipped), (why) => `skipped: ${why}`),
    ),
  ].join('\n');
  const read = yield* Effect.forEach(taken.critique.figures, (one) =>
    Effect.map(fs.readFileString(one.file), (words) => `${one.file}\n${words}`),
  );
  return [
    { type: 'text', text: head },
    ...read.map((text): McpSchema.ContentBlock => ({ type: 'text', text })),
    ...unmatchedLines(taken.match).map((text): McpSchema.ContentBlock => ({ type: 'text', text })),
  ] satisfies ReadonlyArray<McpSchema.ContentBlock>;
});

const check = Effect.fn('EaselMcp.check')(function* (
  params: typeof CheckTool.parametersSchema.Type,
) {
  const film = yield* served(params.films, params.film);
  return checkPage(yield* (yield* FreshFilm).check(film, 'draw', params.scenes ?? []), params);
});

const cues = Effect.fn('EaselMcp.cues')(function* (params: typeof CuesTool.parametersSchema.Type) {
  const film = yield* served(params.films, params.film);
  const read = yield* (yield* FreshFilm).cues(film, Option.fromUndefinedOr(params.scene));
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
  const page = yield* read(film, scene, params.last ?? JOURNAL_LAST, Number.MAX_SAFE_INTEGER);
  return journalPage(page.file, page.lines, page.left);
});

const journalNote = Effect.fn('EaselMcp.journalNote')(function* (
  params: typeof JournalNoteTool.parametersSchema.Type,
) {
  const film = yield* served(params.films, params.film);
  const scene = Option.fromUndefinedOr(params.scene);
  yield* sceneOf(film, scene);
  const noted = yield* note(film, params.text, scene);
  return { file: noted.file, at: noted.entry.at, scene: noted.entry.scene };
});

// ---------------------------------------------------------------------------
// The commands

/** The film's own tools: they read and write the film's files and run its CLI fresh, so any process runs them. */
export const easelCommands = [
  labCommand(CheckTool, { run: (params) => Effect.mapError(check(params), refusedAs) }),
  labCommand(CuesTool, { run: (params) => Effect.mapError(cues(params), refusedAs) }),
  labCommand(JournalTool, { run: (params) => Effect.mapError(journal(params), refusedAs) }),
  labCommand(JournalNoteTool, {
    run: (params) => Effect.mapError(journalNote(params), refusedAs),
  }),
];

/**
 * The easel's pictures, drawn in the lab alone (its warm page, and the
 * critic beside it): each answered on MCP as its lines and its images beside
 * its structured answer, in a terminal as its lines.
 */
export const easelInLab = [
  labCommand(LookTool, {
    run: (params) => Effect.mapError(look(params), refusedAs),
    lines: (taken) => taken.looks.map((one) => lookLine(one, taken.build)),
    content: (taken) => Effect.mapError(lookContent(taken), refusedAs),
  }),
  labCommand(MatchTool, {
    run: (params) => Effect.mapError(matched(params), refusedAs),
    lines: (taken) => [
      matchHead(taken),
      ...taken.figures.flatMap(matchLines),
      ...unmatchedLines(taken),
    ],
    content: (taken) => Effect.mapError(matchContent(taken), refusedAs),
  }),
  labCommand(CritiqueTool, {
    run: (params) => Effect.mapError(critiqued(params), refusedAs),
    lines: (taken) => [
      `${critiqueHead(taken)}${Option.match(Option.fromUndefinedOr(taken.critique.skipped), { onNone: () => '', onSome: (why) => ` skipped="${why}"` })}`,
      ...taken.critique.figures.flatMap((one) => [
        `${one.figure}: ${one.file}`,
        ...one.findings.map((f) => `  ${f.aspect}: ${f.what}`),
      ]),
      ...taken.critique.rejected.map((why) => `rejected: ${why}`),
      ...unmatchedLines(taken.match),
    ],
    content: (taken) => Effect.mapError(critiqueContent(taken), refusedAs),
  }),
];

/** What the lab's MCP says of the easel's tools, beside its own instructions. */
export const EASEL_INSTRUCTIONS =
  "Paint and review a film's scenes with the easel's tools: `look` (stills of a scene as its files stand, as images), `match` (a scene's figures held against their concepts: a table and a side-by-side each), `critique` (the same figures shown at 1:1 to a fresh model: its findings on head angle, face, pose, palette and artifacts), `cues` (each scene's marks and named cues), `check` (scenes checked as drawn), `journal` and `journal_note` (the film's observations, read and noted). Each takes `films`, your checkout's films folder: a lab that serves another checkout's refuses (`LabElsewhere`). How a scene is painted with them, a passage at a time: .claude/skills/film/reference/scene-painter.md in the repository.";
