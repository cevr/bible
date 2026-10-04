// The film tools as a gent project extension: the scene painter's easel.
//
// gent (an Effect-native agent harness) loads this file for a session whose
// working directory is this checkout's root (`.gent/extensions/`, in a project
// the user trusts). It gives an agent the film's own tools, `film.look`,
// `film.check`, `film.cues`, `film.journal`, and the film folder's files
// (`film.read`, `film.write`, `film.edit`), the `scene-painter` agent that
// holds exactly those, and a compactor that condenses a painter's window from
// the files, with no model call.
//
// One file, importing only `effect`, `@gent/core/extensions/api` and
// `@gent/core/extensions/branch-tools`: gent binds those specifiers to the
// modules it runs, so the file needs no `node_modules` of its own (a compiled
// gent has none). The `effect/process` import is a type only, erased by the
// build.
//
// One adapter reaches the film: the checkout's own `film` CLI
// (`apps/animations/cli.ts`), run per call as a process. The look route's
// request, its `FILM_LAB_URL` default (the always-on lab on 8229), the
// `LabElsewhere` guard and `LabDown` live in that CLI; check, cues and the
// journal have no route at all. Each failure the CLI prints comes back as a
// typed tool failure (`FilmRefused`) naming the film's own tag and words.

import { Duration, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import type { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import {
  AgentDefinition,
  AgentName,
  defineExtension,
  defineResource,
  ExtensionContext,
  ExtensionHost,
  runProcess,
  saveToolImage,
  tool,
  ToolImage,
  ToolResultFailure,
  writeFileAtomic,
} from '@gent/core/extensions/api';
import {
  type CompactionRequest,
  type Message,
  ModelCompactionError,
  ModelContextCompactor,
} from '@gent/core/extensions/branch-tools';

// ---------------------------------------------------------------------------
// Limits.

/** The longest any film CLI run may take: `check --draw` draws every scene in-process. */
const CLI_TIMEOUT = Duration.minutes(5);

/**
 * The most characters a tool's result, or a failure's result, encodes to as
 * JSON (escapes included). gent cuts a result over 8,000 and hands the model
 * a `context.read` locator, a tool the painter does not hold; so every result
 * fits under this budget, and one that stops early says how to read on with
 * the film tools.
 */
const RESULT_BUDGET = 7_500;

/** The most characters of a path a result or a failure repeats. */
const PATH_CHARS = 300;

/**
 * A count or cursor no result reaches: a result is measured with it where
 * its real one goes, so the real one always fits.
 */
const FAR = 999_999_999;

/** The most stills one look takes: each is an image the model reads, and a request keeps 20. */
const LOOK_MAX_PLACES = 8;

/** The longest side a still may ask: gent's image store refuses a side over 2,000 pixels. */
const LOOK_MAX_SIZE = 2_000;

/** The most findings a check result lists; the rest are counted. */
const CHECK_MAX_FINDINGS = 24;

/** The most characters of one finding's message a check result keeps. */
const FINDING_CHARS = 400;

/** How many journal entries a condensed window carries. */
const SUMMARY_JOURNAL_LAST = 12;

/** The length `value` encodes to under `schema`, as the JSON text the model is sent. */
const encodedLength = <T, E>(schema: Schema.Codec<T, E>) => {
  const encode = Schema.encodeSync(Schema.fromJsonString(schema));
  return (value: T): number => encode(value).length;
};

/** The largest size in `[0, high]` that `fits`, which holds for every size below one it holds for. */
const largestFitting = (high: number, fits: (size: number) => boolean): number => {
  let low = 0;
  let top = high;
  while (low < top) {
    const mid = Math.ceil((low + top) / 2);
    if (fits(mid)) low = mid;
    else top = mid - 1;
  }
  return low;
};

// ---------------------------------------------------------------------------
// Failures: each a tool's typed failure, its words what the model reads.

/** The film CLI refused: the film's own failure tag (`UnknownScene`, `LabDown`, `PagesBroken`, …) and its words. */
export class FilmRefused extends Schema.TaggedError<FilmRefused>()('FilmRefused', {
  tool: Schema.String,
  tag: Schema.String,
  text: Schema.String,
}) {
  override get message() {
    return `${this.tag}: ${this.text}`;
  }
}

/** The film CLI did not run, or answered in a shape the tool cannot read. */
export class FilmCliFailed extends Schema.TaggedError<FilmCliFailed>()('FilmCliFailed', {
  tool: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.tool}: the film CLI did not answer: ${this.reason}`;
  }
}

/** A path the film's file tools refuse: outside the film's folder, a `..` step, a symbolic link. */
export class FilmPathRefused extends Schema.TaggedError<FilmPathRefused>()('FilmPathRefused', {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: ${this.reason}`;
  }
}

/** A file inside the film's folder that could not be read, written or edited as asked. */
export class FilmFileFailed extends Schema.TaggedError<FilmFileFailed>()('FilmFileFailed', {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: ${this.reason}`;
  }
}

/** A still the lab wrote that gent's image store refuses (too large, unreadable). */
export class FilmImageRefused extends Schema.TaggedError<FilmImageRefused>()('FilmImageRefused', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

/** Every failure a film tool has. */
const FilmFailure = Schema.Union([
  FilmRefused,
  FilmCliFailed,
  FilmPathRefused,
  FilmFileFailed,
  FilmImageRefused,
]);
type FilmFailure = typeof FilmFailure.Type;
const encodeFailure = Schema.encodeSync(FilmFailure);

// ---------------------------------------------------------------------------
// The film CLI: the one adapter.

interface CliRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface Refusal {
  readonly tag: string;
  readonly text: string;
}

/** The line the CLI's logger opens a failure with: `[time] ERROR (#2): `. */
const ERROR_LINE = /\[[^\]]*\] ERROR \(#\d+\): /;

/** A failure's words as the CLI prints them: `Tag: words`. */
const TAGGED_WORDS = /^([A-Z][A-Za-z0-9]*): ([\s\S]*)$/;

/** The most characters of a refusal's words a tool keeps. */
const REFUSAL_CHARS = 4_000;

const TaggedLine = Schema.fromJsonString(Schema.Struct({ _tag: Schema.String }));
const decodeTaggedLine = Schema.decodeUnknownOption(TaggedLine);

/** `text` cut to `chars`, saying so. */
const clip = (text: string, chars: number): string => {
  if (text.length <= chars) return text;
  return `${text.slice(0, chars)}… (${text.length - chars} more characters)`;
};

/** The output's lines, empty ones dropped. */
const linesOf = (text: string): ReadonlyArray<string> =>
  text.split('\n').filter((line) => line.trim() !== '');

const FailureFields = Schema.Record(Schema.String, Schema.String);
type FailureFields = typeof FailureFields.Type;
const failureLength = encodedLength(FailureFields);

/** `fields` with each value cut to `cap` characters, saying so. */
const capFields = (fields: FailureFields, cap: number): FailureFields =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, clip(value, cap)]));

/**
 * A film tool's failure as the model receives it: a `ToolResultFailure`
 * whose result is the failure's tag and fields (`{_tag: 'FilmRefused',
 * tool, tag, text}`), each value cut so the whole encodes within the result
 * budget.
 */
export const modelFailure = (error: FilmFailure): ToolResultFailure => {
  const fields: FailureFields = encodeFailure(error);
  const cap = largestFitting(
    RESULT_BUDGET,
    (size) => failureLength(capFields(fields, size)) <= RESULT_BUDGET,
  );
  return ToolResultFailure.make({
    message: clip(error.message, REFUSAL_CHARS),
    result: capFields(fields, cap),
  });
};

/**
 * What a failed run of the film CLI said: its failure's tag and words, read
 * from the logger's `ERROR` line on stderr (the tag a `--json` failure line on
 * stdout names wins), else the run's last words under `FilmCliExit`.
 */
export const refusalOf = (run: CliRun): Refusal => {
  const at = run.stderr.search(ERROR_LINE);
  const jsonTag = Option.map(
    Option.firstSomeOf(
      linesOf(run.stdout)
        .toReversed()
        .map((line) => decodeTaggedLine(line)),
    ),
    (line) => line._tag,
  );
  if (at < 0) {
    const said = run.stderr.trim() || run.stdout.trim() || `exit ${run.exitCode}`;
    return {
      tag: Option.getOrElse(jsonTag, () => 'FilmCliExit'),
      text: clip(said.slice(-REFUSAL_CHARS), REFUSAL_CHARS),
    };
  }
  const said = run.stderr.slice(at).replace(ERROR_LINE, '').trim();
  const tagged = TAGGED_WORDS.exec(said);
  const tag = Option.getOrElse(jsonTag, () => tagged?.[1] ?? 'FilmCliExit');
  return { tag, text: clip(tagged?.[2] ?? said, REFUSAL_CHARS) };
};

interface CliAnswer {
  readonly stdout: string;
  /** A refusal the caller accepts as an answer (a check's `CheckFailed`). */
  readonly refusal: Option.Option<Refusal>;
}

/**
 * Run the checkout's film CLI (`bun cli.ts <args>` in `<root>/apps/animations`)
 * for `tool`: its stdout, or its failure as `FilmRefused`. A failure whose tag
 * is in `accepted` answers with its stdout and the refusal beside it.
 */
const filmCli = Effect.fn('film.cli')(function* (
  tool: string,
  root: string,
  args: ReadonlyArray<string>,
  accepted: ReadonlyArray<string>,
) {
  const path = yield* Path.Path;
  const run = yield* runProcess('bun', ['cli.ts', ...args], {
    cwd: path.join(root, 'apps', 'animations'),
    timeout: CLI_TIMEOUT,
    stdin: 'ignore',
  }).pipe(Effect.mapError((error) => FilmCliFailed.make({ tool, reason: error.message })));
  if (run.exitCode === 0) {
    const answer: CliAnswer = { stdout: run.stdout, refusal: Option.none() };
    return answer;
  }
  const refusal = refusalOf(run);
  if (accepted.includes(refusal.tag)) {
    const answer: CliAnswer = { stdout: run.stdout, refusal: Option.some(refusal) };
    return answer;
  }
  return yield* FilmRefused.make({ tool, tag: refusal.tag, text: refusal.text });
});

/** `lines` joined under the result budget: as many whole lines as fit, then a count of the rest. */
const boundedLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  const kept: Array<string> = [];
  let chars = 0;
  for (const line of lines) {
    const clipped = clip(line, FINDING_CHARS * 2);
    if (chars + clipped.length > RESULT_BUDGET) {
      kept.push(`… ${lines.length - kept.length} more lines`);
      return kept;
    }
    kept.push(clipped);
    chars += clipped.length + 1;
  }
  return kept;
};

// ---------------------------------------------------------------------------
// Names a tool passes to the CLI. Each refuses a leading `-`, so no value
// reads as a flag.

const FilmName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)).annotate({
  description: 'The film: a folder under apps/animations/src/films (lower case, digits, dashes)',
});

const SceneId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)).annotate({
  description: "A scene, by its id (the script's beat id)",
});

const Place = Schema.String.check(
  Schema.isPattern(/^(?:\d+(?:\.\d+)?|mark:[^\s-][^\s]*|cue:[^\s-][^\s]*)$/),
).annotate({
  description:
    "Where in the scene: seconds into it (2.5), mark:<name> (the mark's word), or cue:<name>[@<0..1>] (a share of the cue, 0 its start)",
});

// ---------------------------------------------------------------------------
// film.look

/** The look as `film look --json` prints it (the lab's `LookTaken`). */
const LookTaken = Schema.fromJsonString(
  Schema.Struct({
    build: Schema.String,
    looks: Schema.Array(
      Schema.Struct({
        file: Schema.String,
        scene: Schema.String,
        at: Schema.String,
        frame: Schema.Finite,
        time: Schema.Finite,
        width: Schema.Finite,
        height: Schema.Finite,
      }),
    ),
  }),
);
const decodeLookTaken = Schema.decodeUnknownOption(LookTaken);

const LookParams = Schema.Struct({
  film: FilmName,
  scene: SceneId,
  at: Schema.NonEmptyArray(Place)
    .check(Schema.isMaxLength(LOOK_MAX_PLACES))
    .annotate({ description: `The places to look at, 1 to ${LOOK_MAX_PLACES}: one still each` }),
  crop: Schema.optionalKey(
    Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int]).annotate({
      description:
        '[x0, y0, x1, y1] in canvas pixels: that region at 1:1 (a face, a hand, lettering)',
    }),
  ),
  size: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: LOOK_MAX_SIZE })).annotate({
      description: `The still's long side in pixels (16 to ${LOOK_MAX_SIZE})`,
    }),
  ),
  mode: Schema.optionalKey(
    Schema.Literals(['plain', 'value', 'squint']).annotate({
      description:
        'plain; value (greys: the light and dark alone); squint (greys, blurred: the big masses, where the eye lands)',
    }),
  ),
});

const LookOutput = Schema.Struct({
  build: Schema.String,
  stills: Schema.Array(Schema.Struct({ image: ToolImage, line: Schema.String })),
});

export const FilmLook = tool({
  id: 'film.look',
  description:
    "Look at a scene as its files stand now: stills from the running lab's warm page in about a second (no render). Returns each still as an image, with one line: its file, place, time in the scene, frame and the lab's build",
  readonly: true,
  params: LookParams,
  output: LookOutput,
  summary: (_input, output) => `${output.stills.length} still(s) · build ${output.build}`,
  execute: Effect.fn('film.look')(function* (params) {
    const ctx = yield* ExtensionContext;
    const args = [
      'look',
      params.film,
      '--scene',
      params.scene,
      ...params.at.flatMap((place) => ['--at', place]),
      ...Option.match(Option.fromUndefinedOr(params.crop), {
        onNone: () => [],
        onSome: (crop) => ['--crop', crop.join(',')],
      }),
      ...Option.match(Option.fromUndefinedOr(params.size), {
        onNone: () => [],
        onSome: (size) => ['--size', String(size)],
      }),
      '--mode',
      params.mode ?? 'plain',
      '--json',
    ];
    const answer = yield* filmCli('film.look', ctx.cwd, args, []);
    const taken = yield* Effect.fromOption(
      Option.firstSomeOf(
        linesOf(answer.stdout)
          .toReversed()
          .map((line) => decodeLookTaken(line)),
      ),
    ).pipe(
      Effect.mapError(() =>
        FilmCliFailed.make({
          tool: 'film.look',
          reason: `it printed no look: ${clip(answer.stdout, 500)}`,
        }),
      ),
    );
    const stills = yield* Effect.forEach(taken.looks, (look) =>
      saveToolImage({
        path: look.file,
        source: `${params.film}/${look.scene} ${look.at} t=${look.time.toFixed(2)}`,
      }).pipe(
        Effect.mapError((error) =>
          FilmImageRefused.make({
            file: look.file,
            reason: `${error.message} (ask a smaller size, or a smaller crop)`,
          }),
        ),
        Effect.map((image) => ({
          image,
          line: clip(
            `${look.file} at=${look.at} t=${look.time.toFixed(2)} frame=${look.frame} size=${look.width}x${look.height} build=${taken.build}`,
            LINE_CHARS,
          ),
        })),
      ),
    );
    return { build: taken.build, stills };
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// film.check

/** One finding as `film check --json` prints it. */
const CheckLine = Schema.fromJsonString(
  Schema.Struct({
    level: Schema.Literals(['error', 'warning']),
    tag: Schema.String,
    message: Schema.String,
    address: Schema.optionalKey(
      Schema.Struct({
        part: Schema.Struct({
          _tag: Schema.String,
          ids: Schema.optionalKey(Schema.Array(Schema.String)),
          act: Schema.optionalKey(Schema.String),
          id: Schema.optionalKey(Schema.String),
        }),
        time: Schema.optionalKey(Schema.Finite),
      }),
    ),
  }),
);
type CheckLine = typeof CheckLine.Type;
const decodeCheckLine = Schema.decodeUnknownOption(CheckLine);

/** Where a finding is, as one word: the film, an act, scenes or a short. */
const whereOf = (line: CheckLine): string =>
  Option.match(Option.fromUndefinedOr(line.address), {
    onNone: () => 'film',
    onSome: ({ part }) => {
      if (part._tag === 'Scenes') return (part.ids ?? []).join(',');
      if (part._tag === 'Act') return `act:${part.act ?? ''}`;
      if (part._tag === 'Short') return `short:${part.id ?? ''}`;
      return 'film';
    },
  });

const Finding = Schema.Struct({
  level: Schema.Literals(['error', 'warning']),
  tag: Schema.String,
  where: Schema.String,
  time: Schema.optionalKey(Schema.Finite),
  message: Schema.String,
});

const CheckOutput = Schema.Struct({
  errors: Schema.Int,
  warnings: Schema.Int,
  /** The place of the first finding listed among all of them, errors first (0: the first). */
  from: Schema.Int,
  findings: Schema.Array(Finding),
  /** Present when findings remain past this page: the `from` that lists them. */
  next: Schema.optionalKey(Schema.Int),
});
type CheckOutput = typeof CheckOutput.Type;
const checkLength = encodedLength(CheckOutput);

/**
 * The findings `film check --json` printed, errors first, from the `from`th
 * on: as many as encode within the result budget (at most 24), and `next`
 * when more remain.
 */
export const checkReport = (stdout: string, from: number): CheckOutput => {
  const lines = linesOf(stdout).flatMap((line) => Option.toArray(decodeCheckLine(line)));
  const errors = lines.filter((line) => line.level === 'error');
  const warnings = lines.filter((line) => line.level === 'warning');
  const findings = [...errors, ...warnings].map((line) => ({
    level: line.level,
    tag: line.tag,
    where: clip(whereOf(line), FINDING_CHARS),
    ...Option.match(Option.fromUndefinedOr(line.address?.time), {
      onNone: () => ({}),
      onSome: (time) => ({ time }),
    }),
    message: clip(line.message, FINDING_CHARS),
  }));
  const start = Math.min(from, findings.length);
  const page = (count: number): CheckOutput => ({
    errors: errors.length,
    warnings: warnings.length,
    from: start,
    findings: findings.slice(start, start + count),
  });
  const count = largestFitting(
    Math.min(CHECK_MAX_FINDINGS, findings.length - start),
    (size) => checkLength({ ...page(size), next: FAR }) <= RESULT_BUDGET,
  );
  if (start + count >= findings.length) return page(count);
  return { ...page(count), next: start + count };
};

export const FilmCheck = tool({
  id: 'film.check',
  description:
    'Check scenes as their files stand (film check --draw): the static leg (cues, sounds) and each scene drawn in-process (a throw, a frame that is not pure, ink over a face), no browser. Stale takes count as warnings: a painter never narrates. Lists the findings a page at a time, errors first: when the answer has `next`, check again with `from: next` for the rest',
  readonly: true,
  params: Schema.Struct({
    film: FilmName,
    scenes: Schema.NonEmptyArray(SceneId).annotate({
      description: 'The scenes to probe; adjacent scenes play one after another',
    }),
    from: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
        description: "The first finding to list: a previous answer's next (0)",
      }),
    ),
  }),
  output: CheckOutput,
  summary: (_input, output) => `${output.errors} error(s), ${output.warnings} warning(s)`,
  execute: Effect.fn('film.check')(function* (params) {
    const ctx = yield* ExtensionContext;
    const args = [
      'check',
      params.film,
      '--scene',
      params.scenes.join(','),
      '--draw',
      '--allow-stale',
      '--json',
    ];
    const answer = yield* filmCli('film.check', ctx.cwd, args, ['CheckFailed']);
    return checkReport(answer.stdout, params.from ?? 0);
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// film.cues

const CuesOutput = Schema.Struct({
  lines: Schema.Array(Schema.String),
  /** The CLI's words when a cue ends after its scene (`CuesLate`): the lines still stand. */
  late: Schema.optionalKey(Schema.String),
  /** Present when lines were left out to fit: how many, and how to read them. */
  rest: Schema.optionalKey(Schema.String),
});
type CuesOutput = typeof CuesOutput.Type;
const cuesLength = encodedLength(CuesOutput);

/** The longest one line of the CLI's output a result keeps. */
const LINE_CHARS = 800;

/**
 * How many of `lines` a result holds: the most whose result, with its note
 * of the rest, `sizeWith` measures within the budget.
 */
const linesThatFit = (lines: ReadonlyArray<string>, sizeWith: (count: number) => number) =>
  largestFitting(lines.length, (count) => sizeWith(count) <= RESULT_BUDGET);

/** The cues result for the CLI's `stdout`: the first lines that fit, and how to read the rest. */
export const cuesReport = (stdout: string, late: Option.Option<string>): CuesOutput => {
  const lines = linesOf(stdout).map((line) => clip(line, LINE_CHARS));
  const base = Option.match(late, {
    onNone: () => ({}),
    onSome: (text) => ({ late: clip(text, REFUSAL_CHARS) }),
  });
  const restOf = (count: number) =>
    `${lines.length - count} more lines left out to fit: ask film.cues for one scene at a time`;
  const count = linesThatFit(lines, (size) =>
    cuesLength({ ...base, lines: lines.slice(0, size), rest: restOf(0) }),
  );
  if (count === lines.length) return { ...base, lines };
  return { ...base, lines: lines.slice(0, count), rest: restOf(count) };
};

export const FilmCues = tool({
  id: 'film.cues',
  description:
    "A scene's placement and its marks and named cues with their times (film cues): start=, dur=, speech=, seam= to the next voice, and each {mark} at its film second. Without a scene, every scene",
  readonly: true,
  params: Schema.Struct({ film: FilmName, scene: Schema.optionalKey(SceneId) }),
  output: CuesOutput,
  summary: (_input, output) => `${output.lines.length} line(s)`,
  execute: Effect.fn('film.cues')(function* (params) {
    const ctx = yield* ExtensionContext;
    const scene = Option.fromUndefinedOr(params.scene);
    const answer = yield* filmCli(
      'film.cues',
      ctx.cwd,
      ['cues', params.film, ...Option.toArray(scene)],
      ['CuesLate'],
    );
    return cuesReport(
      answer.stdout,
      Option.map(answer.refusal, (refusal) => refusal.text),
    );
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// film.journal

const JournalParams = Schema.Struct({
  film: FilmName,
  op: Schema.Literals(['read', 'note']).annotate({
    description: 'read: the newest entries, oldest first; note: append one observation',
  }),
  scene: Schema.optionalKey(
    SceneId.annotate({ description: 'The scene the note is of, or the only scene read' }),
  ),
  text: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'The observation (note): what was seen, heard or measured, never what to do. One line',
    }),
  ),
  last: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })).annotate({
      description: 'How many of the newest entries read prints (20)',
    }),
  ),
});

const JournalOutput = Schema.Struct({
  lines: Schema.Array(Schema.String),
  /** Present when older lines were left out to fit: how many, and how to read them. */
  earlier: Schema.optionalKey(Schema.String),
});
type JournalOutput = typeof JournalOutput.Type;
const journalLength = encodedLength(JournalOutput);

/** The journal result for the CLI's `stdout`: the newest lines that fit, and how to read the older. */
export const journalReport = (stdout: string): JournalOutput => {
  const lines = linesOf(stdout).map((line) => clip(line, LINE_CHARS));
  const earlierOf = (count: number) =>
    `${lines.length - count} earlier lines left out to fit: film.read path journal.md reads the whole journal`;
  const count = linesThatFit(lines, (size) =>
    journalLength({ lines: lines.slice(lines.length - size), earlier: earlierOf(0) }),
  );
  if (count === lines.length) return { lines };
  return { lines: lines.slice(lines.length - count), earlier: earlierOf(count) };
};

export const FilmJournal = tool({
  id: 'film.journal',
  description:
    "The film's journal (src/films/<film>/journal.md, committed): read what was noticed before working on a scene, and note what a look taught. An entry is an observation, never an instruction",
  params: JournalParams,
  output: JournalOutput,
  summary: (input, output) => {
    if (input.op === 'note') return 'noted';
    return `${output.lines.length} line(s)`;
  },
  execute: Effect.fn('film.journal')(function* (params) {
    const ctx = yield* ExtensionContext;
    const scene = Option.match(Option.fromUndefinedOr(params.scene), {
      onNone: () => [],
      onSome: (id) => ['--scene', id],
    });
    if (params.op === 'note') {
      // `--` ends the flags: a note that opens with `-` is still its words.
      const args = ['journal', params.film, 'note', ...scene, '--', params.text ?? ''];
      const answer = yield* filmCli('film.journal', ctx.cwd, args, []);
      return journalReport(answer.stdout);
    }
    const last = Option.match(Option.fromUndefinedOr(params.last), {
      onNone: () => [],
      onSome: (count) => ['--last', String(count)],
    });
    const answer = yield* filmCli(
      'film.journal',
      ctx.cwd,
      ['journal', params.film, 'read', ...scene, ...last],
      [],
    );
    return journalReport(answer.stdout);
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// The film folder's files: a guard, not a sandbox.

/** The folders the file tools reach: the film's own, and (to read) the film skill's rules. */
const Within = Schema.Literals(['film', 'skill']);
type Within = typeof Within.Type;

/** A file the guard admitted: its absolute path, and its path as shown, from its folder. */
interface Guarded {
  readonly file: string;
  readonly shown: string;
}

/**
 * The file `given` names inside the film `film`'s folder of the checkout at
 * `root` (`apps/animations/src/films/<film>/`), or inside the film skill's
 * folder (`.claude/skills/film/`) for `within: 'skill'`. Relative paths are
 * read from that folder; an absolute one must lie in it. A `..` step, a path
 * outside, and a symbolic link anywhere from the folder down (the folder
 * itself included) are refused. A guard against mistakes, not a sandbox: a
 * link made after the check is not seen.
 */
export const guardPath = Effect.fn('film.guard')(function* (
  root: string,
  film: string,
  given: string,
  within: Within,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.join(root, '.claude', 'skills', 'film');
  const base = Option.match(
    Option.liftPredicate(within, (w) => w === 'skill'),
    {
      onSome: () => folder,
      onNone: () => path.join(root, 'apps', 'animations', 'src', 'films', film),
    },
  );
  if (given.split(/[\\/]/).includes('..'))
    return yield* FilmPathRefused.make({ path: given, reason: 'a ".." step is refused' });
  const link = yield* fs.readLink(base).pipe(Effect.option);
  if (Option.isSome(link))
    return yield* FilmPathRefused.make({ path: base, reason: 'the folder is a symbolic link' });
  const real = yield* fs
    .realPath(base)
    .pipe(Effect.mapError(() => FilmPathRefused.make({ path: base, reason: 'no such folder' })));
  const target = path.resolve(base, given);
  const inside = (folderPath: string) => {
    const relative = path.relative(folderPath, target);
    const leaves =
      relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
    return Option.liftPredicate(relative, () => !leaves);
  };
  const shown = yield* Effect.fromOption(Option.orElse(inside(base), () => inside(real))).pipe(
    Effect.mapError(() => FilmPathRefused.make({ path: given, reason: `outside ${base}` })),
  );
  let file = real;
  for (const part of shown.split(path.sep).filter((step) => step !== '')) {
    file = path.join(file, part);
    const step = yield* fs.readLink(file).pipe(Effect.option);
    if (Option.isSome(step))
      return yield* FilmPathRefused.make({ path: given, reason: `${part} is a symbolic link` });
  }
  const guarded: Guarded = { file, shown };
  return guarded;
});

const PathParam = Schema.String.annotate({
  description:
    "The file, from the film's folder (scenes/roof.ts, kit.ts); an absolute path must lie inside it",
});

const ReadParams = Schema.Struct({
  film: FilmName,
  path: PathParam,
  within: Schema.optionalKey(
    Within.annotate({
      description:
        "film (default): the film's folder. skill: the film skill's rules, read only (SKILL.md, CRAFT.md, reference/director-vision.md)",
    }),
  ),
  from: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: 'The line to start at (1)',
    }),
  ),
  column: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
      description: "The character of that line to start at (1): a previous answer's next.column",
    }),
  ),
});

/** Where a read starts, or goes on: a line, and a character in it (both from 1). */
const ReadCursor = Schema.Struct({ from: Schema.Int, column: Schema.Int });

const ReadOutput = Schema.Struct({
  path: Schema.String,
  /** Where `text` starts: its line and the character in that line. */
  from: Schema.Int,
  column: Schema.Int,
  /** The line `text` ends in, and the file's line count. */
  to: Schema.Int,
  total: Schema.Int,
  /** The file's text from `from`/`column`, exactly: never cut inside, only where it stops. */
  text: Schema.String,
  /** Present when the file goes on: the `from` and `column` that read the rest. */
  next: Schema.optionalKey(ReadCursor),
});
type ReadOutput = typeof ReadOutput.Type;
const readLength = encodedLength(ReadOutput);

/** A high surrogate: the first half of a character the window must not split. */
const isHighSurrogate = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;

/**
 * The window of `text` a read starting at line `from`, character `column`
 * returns: as much as encodes within the result budget, ending at a line's
 * end when one falls in its second half, and `next` where the rest starts.
 * The cursor moves over exactly the characters returned, so a line longer
 * than one window comes back whole across reads.
 */
export const readWindow = (
  shown: string,
  text: string,
  cursor: { readonly from?: number; readonly column?: number },
): ReadOutput => {
  const lines = text.split('\n');
  const from = Math.min(cursor.from ?? 1, lines.length);
  const lineStart = lines.slice(0, from - 1).reduce((sum, line) => sum + line.length + 1, 0);
  const column = Math.min(cursor.column ?? 1, (lines[from - 1] ?? '').length + 1);
  const rest = text.slice(lineStart + column - 1);
  const sized = (size: number): ReadOutput => ({
    path: shown,
    from,
    column,
    to: FAR,
    total: lines.length,
    text: rest.slice(0, size),
    next: { from: FAR, column: FAR },
  });
  const fits = (size: number) => readLength(sized(size)) <= RESULT_BUDGET;
  let size = rest.length;
  if (!fits(size)) {
    size = largestFitting(Math.min(rest.length, RESULT_BUDGET), fits);
    const lineEnd = rest.lastIndexOf('\n', size - 1) + 1;
    if (lineEnd >= size / 2) size = lineEnd;
    else if (isHighSurrogate(rest.charCodeAt(size - 1))) size -= 1;
  }
  const window = rest.slice(0, size);
  const breaks = window.split('\n').length - 1;
  const trailing = Number(window.endsWith('\n'));
  const base: ReadOutput = {
    path: shown,
    from,
    column,
    to: from + breaks - trailing,
    total: lines.length,
    text: window,
  };
  if (size === rest.length) return base;
  const nextColumn = Option.match(
    Option.liftPredicate(breaks, (count) => count > 0),
    {
      onNone: () => column + size,
      onSome: () => window.length - window.lastIndexOf('\n'),
    },
  );
  return { ...base, next: { from: from + breaks, column: nextColumn } };
};

export const FilmRead = tool({
  id: 'film.read',
  description:
    "Read a file of the film's folder (apps/animations/src/films/<film>/), or of the film skill's rules (within: skill), as it stands. A long file comes a window at a time: when the answer has `next`, read on with its `from` and `column`",
  readonly: true,
  params: ReadParams,
  output: ReadOutput,
  summary: (_input, output) =>
    `${output.path} lines ${output.from}–${output.to} of ${output.total}`,
  execute: Effect.fn('film.read')(function* (params) {
    const ctx = yield* ExtensionContext;
    const fs = yield* FileSystem.FileSystem;
    const guarded = yield* guardPath(ctx.cwd, params.film, params.path, params.within ?? 'film');
    const text = yield* fs
      .readFileString(guarded.file)
      .pipe(
        Effect.mapError((error) =>
          FilmFileFailed.make({ path: guarded.shown, reason: error.message }),
        ),
      );
    return readWindow(clip(guarded.shown, PATH_CHARS), text, params);
  }, Effect.mapError(modelFailure)),
});

export const FilmWrite = tool({
  id: 'film.write',
  description:
    "Write a whole file in the film's folder (apps/animations/src/films/<film>/), creating it and its folders if needed. Prefer film.edit for a change to part of a file",
  destructive: true,
  params: Schema.Struct({
    film: FilmName,
    path: PathParam,
    content: Schema.String.annotate({ description: "The file's whole new text" }),
  }),
  output: Schema.Struct({ path: Schema.String, bytes: Schema.Int }),
  summary: (_input, output) => `${output.path} · ${output.bytes} bytes`,
  execute: Effect.fn('film.write')(function* (params) {
    const ctx = yield* ExtensionContext;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const guarded = yield* guardPath(ctx.cwd, params.film, params.path, 'film');
    return yield* ctx.FileLock.withLock(
      guarded.file,
      Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(guarded.file), { recursive: true });
        yield* writeFileAtomic(guarded.file, params.content);
        return {
          path: clip(guarded.shown, PATH_CHARS),
          bytes: new TextEncoder().encode(params.content).length,
        };
      }).pipe(
        Effect.mapError((error) =>
          FilmFileFailed.make({ path: guarded.shown, reason: error.message }),
        ),
      ),
    );
  }, Effect.mapError(modelFailure)),
});

export const FilmEdit = tool({
  id: 'film.edit',
  description:
    "Replace an exact string in a file of the film's folder. Fails when oldString is not found, or is found more than once without replaceAll",
  destructive: true,
  params: Schema.Struct({
    film: FilmName,
    path: PathParam,
    oldString: Schema.String.annotate({ description: "The file's text to replace, exactly" }),
    newString: Schema.String.annotate({ description: 'The text to put in its place' }),
    replaceAll: Schema.optionalKey(
      Schema.Boolean.annotate({ description: 'Replace every occurrence (default: exactly one)' }),
    ),
  }),
  output: Schema.Struct({ path: Schema.String, replacements: Schema.Int }),
  summary: (_input, output) => `${output.path} · ${output.replacements} replacement(s)`,
  execute: Effect.fn('film.edit')(function* (params) {
    const ctx = yield* ExtensionContext;
    const fs = yield* FileSystem.FileSystem;
    const guarded = yield* guardPath(ctx.cwd, params.film, params.path, 'film');
    const failed = (reason: string) => FilmFileFailed.make({ path: guarded.shown, reason });
    if (params.oldString === '') return yield* failed('oldString is empty');
    return yield* ctx.FileLock.withLock(
      guarded.file,
      Effect.gen(function* () {
        const text = yield* fs
          .readFileString(guarded.file)
          .pipe(Effect.mapError((error) => failed(error.message)));
        const pieces = text.split(params.oldString);
        const found = pieces.length - 1;
        if (found === 0) return yield* failed('oldString not found');
        if (found > 1 && params.replaceAll !== true)
          return yield* failed(
            `oldString found ${found} times: give more of the text around it, or replaceAll`,
          );
        // Split and join: the new text goes in as written (no `$&` patterns).
        yield* writeFileAtomic(guarded.file, pieces.join(params.newString)).pipe(
          Effect.mapError((error) => failed(error.message)),
        );
        return { path: clip(guarded.shown, PATH_CHARS), replacements: found };
      }),
    );
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// The scene painter.

export const PAINTER = AgentName.make('scene-painter');

/** Every tool the painter holds: the film's, and no other. */
export const FILM_TOOL_IDS = [
  'film.read',
  'film.write',
  'film.edit',
  'film.cues',
  'film.look',
  'film.journal',
  'film.check',
] as const;

/**
 * The painter's brief: the same bytes every turn (it is part of the cached
 * prompt). What changes (the journal, the cues, the stills) comes through
 * the tools, never here.
 */
export const PAINTER_BRIEF = [
  'You paint one scene of a narrated cut-paper film: its drawing, in apps/animations/src/films/<film>/scenes/<scene>.ts and the film files it reads. The user names the film and the scene.',
  '',
  'Your tools are the film tools and no others: film.read (the film folder, or the film skill with within: skill), film.write and film.edit (the film folder only), film.cues, film.look, film.journal and film.check.',
  '',
  'Work in passages:',
  '1. Read first. film.journal op=read for the scene: what was noticed before. film.cues for the scene: its marks and named cues with their times. film.read the scene file, the beat in script.ts, and what the scene imports from the film folder.',
  '2. Paint one passage: a figure placed, a framing, a light, a line of type. Pin every motion to a mark or a named cue, never to a hand-timed second.',
  '3. Look after every passage, before the next one: film.look at the marks and at the middle of each cue that moves something (mark:<name>, cue:<name>@0.5). mode value checks the light and dark, mode squint where the eye lands first, crop a face, a hand or lettering at 1:1. Read every still.',
  '4. Note what a look taught in the journal (film.journal op=note, with the scene): what is, never what to do. A decision lands in the source; a request for the owner is not a journal entry.',
  '5. Before you finish, film.check the scenes you touched. Fix each finding in the scene, or say why it stands.',
  '',
  'The rules live in files, never in your memory. Read them with film.read within: skill: SKILL.md (step 4, Scenes, and the Easel section), CRAFT.md and reference/director-vision.md. What a picture teaches comes from the film folder (script.ts, sources.md, quotes.jsonl), never from what you remember of the subject.',
].join('\n');

export const scenePainter = AgentDefinition.make({
  name: PAINTER,
  description:
    'Paints one scene of a film in apps/animations: reads its cues and journal, paints a passage, looks, notes what it saw, checks',
  systemPromptAddendum: PAINTER_BRIEF,
  allowedTools: [...FILM_TOOL_IDS],
});

// ---------------------------------------------------------------------------
// The painter's compactor: the window condensed from the files.

/** Where a painter paints: a film and one of its scenes. */
interface Place {
  readonly film: string;
  readonly scene: string;
}

/** A file a painter wrote: its film, and its path in the film's folder. */
interface Written {
  readonly film: string;
  readonly path: string;
}

/**
 * What a painter's window says of its work, read oldest first: the scene it
 * paints, the files it wrote, and the lines of its last look. An earlier
 * painter notice in the window (a handoff) carries all three forward; a film
 * call after it updates them.
 */
interface Trail {
  readonly place: Option.Option<Place>;
  readonly written: ReadonlyArray<Written>;
  readonly look: Option.Option<ReadonlyArray<string>>;
}

const NO_TRAIL: Trail = { place: Option.none(), written: [], look: Option.none() };

/**
 * What the compactor reads of a film call's input, held to the tools' own
 * schemas: a value the model sent that no tool would take is not passed on.
 */
const CallParams = Schema.Struct({
  film: Schema.optionalKey(FilmName),
  scene: Schema.optionalKey(SceneId),
  scenes: Schema.optionalKey(Schema.NonEmptyArray(SceneId)),
  path: Schema.optionalKey(Schema.String),
});
const decodeCallParams = Schema.decodeUnknownOption(CallParams);
const LookLines = Schema.Struct({ stills: Schema.Array(Schema.Struct({ line: Schema.String })) });
const decodeLookLines = Schema.decodeUnknownOption(LookLines);

/** The first words of a painter notice: how a later compaction finds an earlier one. */
const NOTICE_HEADER =
  'Earlier parts of this session were condensed. What follows is read from the files as they stand now.';

/** A painter notice's scene line. */
const SCENE_LINE = /^film ([a-z0-9][a-z0-9-]*), scene ([a-z0-9][a-z0-9-]*)$/m;

/** A painter notice's line for a file written: its film and path, then its size or absence. */
const WRITTEN_LINE =
  /^apps\/animations\/src\/films\/([a-z0-9][a-z0-9-]*)\/(.+) \((?:\d+ bytes|not there now)\)$/;

/** The body of section `heading` of a painter notice, up to the next section. */
const sectionOf = (notice: string, heading: string): Option.Option<string> => {
  const opening = `\n\n## ${heading}\n`;
  const at = notice.indexOf(opening);
  if (at < 0) return Option.none();
  const body = notice.slice(at + opening.length);
  const end = body.indexOf('\n\n## ');
  if (end < 0) return Option.some(body);
  return Option.some(body.slice(0, end));
};

/** The trail an earlier painter notice carried forward, when `text` is one that names a scene. */
const noticeTrail = (text: string): Option.Option<Trail> => {
  if (!text.includes(NOTICE_HEADER)) return Option.none();
  return Option.map(
    Option.flatMap(Option.fromNullishOr(SCENE_LINE.exec(text)), (match) =>
      Option.all({
        film: Option.fromUndefinedOr(match[1]),
        scene: Option.fromUndefinedOr(match[2]),
      }),
    ),
    (place) => ({
      place: Option.some(place),
      written: Option.match(sectionOf(text, 'Files written'), {
        onNone: () => [],
        onSome: (body) =>
          body.split('\n').flatMap((line) => {
            const match = WRITTEN_LINE.exec(line);
            return Option.toArray(
              Option.all({
                film: Option.fromUndefinedOr(match?.[1]),
                path: Option.fromUndefinedOr(match?.[2]),
              }),
            );
          }),
      }),
      look: Option.filter(
        Option.map(sectionOf(text, 'Last look'), (body) => body.split('\n')),
        (lines) => !(lines[0] ?? '(').startsWith('('),
      ),
    }),
  );
};

/** The place a film call names: its film and its scene (a check's first scene). */
const callPlace = (params: typeof CallParams.Type): Option.Option<Place> =>
  Option.all({
    film: Option.fromUndefinedOr(params.film),
    scene: Option.orElse(Option.fromUndefinedOr(params.scene), () =>
      Option.map(Option.fromUndefinedOr(params.scenes), (scenes) => scenes[0]),
    ),
  });

/** `trail` after one film call: its place, the file it wrote, the stills it answered with. */
const afterCall = (
  trail: Trail,
  name: string,
  params: typeof CallParams.Type,
  result: Option.Option<{ readonly value: unknown; readonly failed: boolean }>,
): Trail => {
  const wrote = Option.filter(
    Option.all({
      film: Option.fromUndefinedOr(params.film),
      path: Option.fromUndefinedOr(params.path),
    }),
    () => name === 'film.write' || name === 'film.edit',
  );
  const saw = Option.flatMap(
    Option.filter(result, (answer) => name === 'film.look' && !answer.failed),
    (answer) =>
      Option.map(decodeLookLines(answer.value), ({ stills }) => stills.map((still) => still.line)),
  );
  return {
    place: Option.orElse(callPlace(params), () => trail.place),
    written: [...trail.written, ...Option.toArray(wrote)],
    look: Option.orElse(saw, () => trail.look),
  };
};

/** The trail of `messages`, oldest first. */
const trailOf = (messages: ReadonlyArray<Message>): Trail => {
  const parts = messages.flatMap((message) => message.parts);
  const results = new Map(
    parts.flatMap((part) => {
      if (part.type !== 'tool-result') return [];
      return [[part.id, { value: part.result, failed: part.isFailure }] as const];
    }),
  );
  return parts.reduce((trail: Trail, part) => {
    if (part.type === 'text') return Option.getOrElse(noticeTrail(part.text), () => trail);
    if (part.type !== 'tool-call' || !part.name.startsWith('film.')) return trail;
    return afterCall(
      trail,
      part.name,
      Option.getOrElse(decodeCallParams(part.params), () => ({})),
      Option.fromUndefinedOr(results.get(part.id)),
    );
  }, NO_TRAIL);
};

/** A Markdown quote of `lines`, so none of them reads as a heading of the notice. */
const quoted = (lines: ReadonlyArray<string>): string =>
  lines.map((line) => `> ${line}`).join('\n');

/** `film`'s file `given`, its path from the checkout and its size, or why it cannot be named. */
const fileLine = Effect.fn('film.compact.file')(function* (
  root: string,
  film: string,
  given: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const shown = `apps/animations/src/films/${film}/${given}`;
  return yield* guardPath(root, film, given, 'film').pipe(
    Effect.flatMap((guarded) => fs.stat(guarded.file)),
    Effect.match({
      onFailure: () => `${shown} (not there now)`,
      onSuccess: (info) => `${shown} (${info.size} bytes)`,
    }),
  );
});

/** What the film CLI prints for `args`, or a line saying why it printed nothing. */
const cliLines = (root: string, args: ReadonlyArray<string>) =>
  filmCli('film.compact', root, args, ['CuesLate']).pipe(
    Effect.match({
      onFailure: (error) => [`(could not read: ${clip(error.message, 400)})`],
      onSuccess: (answer) => boundedLines(linesOf(answer.stdout)),
    }),
  );

/**
 * The notice a painter's condensed window carries, read from the files as
 * they stand: the scene's file, the files written, the scene's newest
 * journal entries, its cues, and the last look's stills. Statements only: no
 * next steps.
 */
export const painterNotice = Effect.fn('film.compact.notice')(function* (
  root: string,
  request: Pick<CompactionRequest, 'history' | 'kept'>,
) {
  const trail = trailOf([...request.history, ...request.kept]);
  if (Option.isNone(trail.place))
    return `${NOTICE_HEADER}\n\nNo film tool named a film and a scene in the condensed part.`;
  const { film, scene } = trail.place.value;
  const written = [
    ...new Set(trail.written.filter((wrote) => wrote.film === film).map((wrote) => wrote.path)),
  ];
  const sceneFile = yield* fileLine(root, film, `scenes/${scene}.ts`);
  const files = yield* Effect.forEach(written, (given) => fileLine(root, film, given));
  const journal = yield* cliLines(root, [
    'journal',
    film,
    'read',
    '--scene',
    scene,
    '--last',
    String(SUMMARY_JOURNAL_LAST),
  ]);
  const cues = yield* cliLines(root, ['cues', film, scene]);
  return [
    NOTICE_HEADER,
    `## Scene\nfilm ${film}, scene ${scene}\n${sceneFile}`,
    `## Files written\n${files.join('\n') || '(none)'}`,
    `## Journal: the newest entries for the scene, as written\n${quoted(journal)}`,
    `## Cues\n${cues.join('\n')}`,
    `## Last look\n${Option.match(trail.look, {
      onNone: () => '(no look this session)',
      onSome: (lines) => lines.join('\n'),
    })}`,
  ].join('\n\n');
});

/**
 * The compactor for the checkout at `root`: a scene painter's window is
 * condensed from the files with no model call; any other agent's is refused
 * (`ModelCompactionError`), so the next compactor in the chain (gent's own)
 * summarizes it.
 */
export const painterCompactor = (root: string) =>
  Layer.effect(
    ModelContextCompactor,
    Effect.gen(function* () {
      const services = yield* Effect.context<
        FileSystem.FileSystem | Path.Path | ChildProcessSpawner
      >();
      return ModelContextCompactor.of({
        compact: (request) => {
          if (request.agentName !== PAINTER)
            return Effect.fail(
              ModelCompactionError.make({
                modelId: request.modelId,
                reason: `the film compactor serves only ${PAINTER}`,
              }),
            );
          return painterNotice(root, request).pipe(
            Effect.provideContext(services),
            Effect.map((notice) => ({ notice, modelId: request.modelId })),
          );
        },
      });
    }),
  );

// ---------------------------------------------------------------------------
// The extension.

export default defineExtension({
  id: 'film',
  setup: Effect.gen(function* () {
    const host = yield* ExtensionHost;
    yield* host.register(
      'tool',
      FilmLook,
      FilmCheck,
      FilmCues,
      FilmJournal,
      FilmRead,
      FilmWrite,
      FilmEdit,
    );
    yield* host.register('agent', scenePainter);
    yield* host.register(
      'resource',
      defineResource({
        id: 'film/painter-compactor',
        scope: 'process',
        layer: painterCompactor(host.cwd),
      }),
    );
  }),
});
