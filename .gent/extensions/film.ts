// The film tools as a gent project extension: the scene painter's easel.
//
// gent (an Effect-native agent harness) loads this file for a session whose
// working directory is this checkout's root (`.gent/extensions/`, in a project
// the user trusts). It gives an agent the film's own tools, `film.look`,
// `film.check`, `film.cues`, `film.journal`; the `scene-painter` agent that
// holds exactly those and gent's file tools (`read`, `write`, `edit`,
// `grep`), which its `paths` confine to the films and, to read, the film
// skill; `film.paint`, which starts one painter on one film, its paths that
// film's folder; and a compactor that condenses a painter's window from the
// files, with no model call.
//
// One file, since its parts change together, importing only `effect`,
// `@gent/core/extensions/api` and `@gent/core/extensions/branch-tools`: gent
// binds those specifiers to the modules it runs, so the file needs no
// `node_modules` of its own (a compiled gent has none). The `effect/process`
// import is a type only, erased by the build.
//
// One adapter reaches the film: the checkout's own `film` CLI
// (`apps/animations/cli.ts`), run per call as a process. The look route's
// request, its `FILM_LAB_URL` default (the always-on lab on 8229), the
// `LabElsewhere` guard and `LabDown` live in that CLI; check, cues and the
// journal have no route at all.
//
// Every result and every failure fits gent's 8,000-character tool result
// whole (`RESULT_BUDGET`): a result that stops early says how to read on with
// the painter's own tools. A failure reaches the model as a
// `ToolResultFailure` whose result is its tag and fields: a CLI refusal is
// `{_tag: 'FilmRefused', tool, tag, text}`, the film's own tag and words.

import { Duration, Effect, FileSystem, Hash, Layer, Option, Path, Schema } from 'effect';
import type { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import {
  ActorCommandId,
  AgentDefinition,
  AgentName,
  BranchId,
  contextWindowOf,
  defineExtension,
  defineResource,
  ExtensionContext,
  ExtensionHost,
  RequestId,
  runProcess,
  saveToolImage,
  SessionId,
  tool,
  ToolImage,
  ToolResultFailure,
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
 * the painter's own tools.
 */
const RESULT_BUDGET = 7_500;

/**
 * A count or cursor no result reaches: a result is measured with it where
 * its real one goes, so the real one always fits.
 */
const FAR = 999_999_999;

/** The most stills one look takes: each is an image the model reads, and a request keeps 20. */
const LOOK_MAX_PLACES = 8;

/**
 * The longest side a still may ask: gent scales a side over 2,000 pixels down
 * before the model sees it, so a larger still costs render time and shows no more.
 */
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

/** A high surrogate: the first half of a character a cut must not split. */
const isHighSurrogate = (code: number) => code >= 0xd8_00 && code <= 0xdb_ff;

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

/** A still the lab wrote that gent's image store refuses: bytes no decoder reads (a larger one is scaled, not refused). */
export class FilmImageRefused extends Schema.TaggedError<FilmImageRefused>()('FilmImageRefused', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

/** gent refused to make the painter's session, or to send it its task. */
export class FilmPaintFailed extends Schema.TaggedError<FilmPaintFailed>()('FilmPaintFailed', {
  film: Schema.String,
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.film}/${this.scene}: the painter did not start: ${this.reason}`;
  }
}

/** Every failure a film tool has. */
const FilmFailure = Schema.Union([FilmRefused, FilmCliFailed, FilmImageRefused, FilmPaintFailed]);
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

/** The films, from the checkout's root (the session cwd): each film is a folder in it. */
const FILMS_FOLDER = 'apps/animations/src/films';

const FilmName = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/)).annotate({
  description: `The film: a folder under ${FILMS_FOLDER} (lower case, digits, dashes)`,
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
type LookOutput = typeof LookOutput.Type;
const lookLength = encodedLength(LookOutput);

/** Seconds as a place writes them, and as the film CLI reads them (`Number`). */
const SECONDS = /^\d+(?:\.\d+)?$/;

/**
 * Seconds written as the CLI reads them: the number printed (`0002.50` is
 * `2.5`). A number JavaScript prints with an exponent keeps its digits, its
 * idle zeroes dropped, so the CLI still reads it as seconds.
 */
const plainSeconds = (text: string): string => {
  const printed = String(Number(text));
  if (SECONDS.test(printed)) return printed;
  return text
    .replace(/^0+(?=\d)/, '')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
};

/** A place as the CLI reads it: its seconds, or its cue's share, as the number printed. */
const plainPlace = (place: string): string => {
  if (SECONDS.test(place)) return plainSeconds(place);
  return Option.match(Option.fromNullishOr(/^(cue:[^@]+)@(\d+(?:\.\d+)?)$/.exec(place)), {
    onNone: () => place,
    onSome: ([, cue, share]) => `${cue}@${plainSeconds(share ?? '')}`,
  });
};

/**
 * The look's result within the budget, measured whole (each image's record,
 * its source included): every string the lab echoed cut to the longest
 * length that fits.
 */
const lookWithin = (output: LookOutput): LookOutput => {
  const capped = (cap: number): LookOutput => ({
    build: clip(output.build, cap),
    stills: output.stills.map(({ image, line }) => ({
      image: Option.match(Option.fromUndefinedOr(image.source), {
        onNone: () => image,
        onSome: (source) => ({ ...image, source: clip(source, cap) }),
      }),
      line: clip(line, cap),
    })),
  });
  return capped(largestFitting(RESULT_BUDGET, (size) => lookLength(capped(size)) <= RESULT_BUDGET));
};

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
      ...params.at.flatMap((place) => ['--at', plainPlace(place)]),
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
            reason: `the lab wrote an unreadable still: ${error.message} (look again; if it repeats, the lab's easel is broken)`,
          }),
        ),
        Effect.map((image) => ({
          image,
          line: `${look.file} at=${look.at} t=${look.time.toFixed(2)} frame=${look.frame} size=${look.width}x${look.height} build=${taken.build}`,
        })),
      ),
    );
    return lookWithin({ build: taken.build, stills });
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

/**
 * Where a check's next page starts: the place of its first finding, and the
 * report it is a place in (a fingerprint of every finding, in order).
 */
const CheckCursor = Schema.Struct({ from: Schema.Int, report: Schema.String });

const CheckOutput = Schema.Struct({
  errors: Schema.Int,
  warnings: Schema.Int,
  /** The place of the first finding listed among all of them, errors first (0: the first). */
  from: Schema.Int,
  findings: Schema.Array(Finding),
  /**
   * Present when the check asked for was a later page of a report whose
   * findings have changed since: this page starts again from the first.
   */
  restarted: Schema.optionalKey(Schema.String),
  /** Present when findings remain past this page: the `from` and `report` that list them. */
  next: Schema.optionalKey(CheckCursor),
});
type CheckOutput = typeof CheckOutput.Type;
const checkLength = encodedLength(CheckOutput);
const encodeFinding = Schema.encodeSync(Schema.fromJsonString(Finding));

/**
 * A report's fingerprint: its count and a hash of every finding, whole and in
 * order. A finding fixed, added or reworded between pages changes it.
 */
const reportOf = (findings: ReadonlyArray<typeof Finding.Type>): string => {
  const hash = Hash.string(findings.map((finding) => encodeFinding(finding)).join('\n'));
  return `${findings.length}.${(hash >>> 0).toString(16)}`;
};

/**
 * The findings `film check --json` printed, errors first, from the cursor's
 * `from`th on: as many as encode within the result budget (at most 24), and
 * `next` when more remain. A cursor from another report (findings fixed or
 * added since its page) starts again from the first, and says so, so no
 * finding is skipped unseen.
 */
export const checkReport = (
  stdout: string,
  cursor: { readonly from?: number; readonly report?: string },
): CheckOutput => {
  const lines = linesOf(stdout).flatMap((line) => Option.toArray(decodeCheckLine(line)));
  const errors = lines.filter((line) => line.level === 'error');
  const warnings = lines.filter((line) => line.level === 'warning');
  const whole = [...errors, ...warnings].map((line) => ({
    level: line.level,
    tag: line.tag,
    where: whereOf(line),
    ...Option.match(Option.fromUndefinedOr(line.address?.time), {
      onNone: () => ({}),
      onSome: (time) => ({ time }),
    }),
    message: line.message,
  }));
  const report = reportOf(whole);
  const findings = whole.map((finding) => ({
    ...finding,
    where: clip(finding.where, FINDING_CHARS),
    message: clip(finding.message, FINDING_CHARS),
  }));
  // A later page is read only in the report it was given for: a `from` of
  // another report, or of none, would skip findings that moved up.
  const changed = Option.liftPredicate(
    cursor,
    (asked) => (asked.from ?? 0) > 0 && asked.report !== report,
  );
  const restarted = Option.match(changed, {
    onNone: () => ({}),
    onSome: () => ({
      restarted:
        'the findings changed since the page asked for (some fixed, or new), or no report was given: listed again from the first',
    }),
  });
  const start = Option.match(changed, {
    onNone: () => Math.min(cursor.from ?? 0, findings.length),
    onSome: () => 0,
  });
  const page = (count: number): CheckOutput => ({
    errors: errors.length,
    warnings: warnings.length,
    from: start,
    findings: findings.slice(start, start + count),
    ...restarted,
  });
  const count = largestFitting(
    Math.min(CHECK_MAX_FINDINGS, findings.length - start),
    (size) => checkLength({ ...page(size), next: { from: FAR, report } }) <= RESULT_BUDGET,
  );
  if (start + count >= findings.length) return page(count);
  return { ...page(count), next: { from: start + count, report } };
};

export const FilmCheck = tool({
  id: 'film.check',
  description:
    'Check scenes as their files stand (film check --draw): the static leg (cues, sounds) and each scene drawn in-process (a throw, a frame that is not pure, ink over a face), no browser. Stale takes count as warnings: a painter never narrates. Lists the findings a page at a time, errors first: when the answer has `next`, check again with its `from` and `report` for the rest. When the findings changed in between, the answer says `restarted` and lists them again from the first',
  readonly: true,
  params: Schema.Struct({
    film: FilmName,
    scenes: Schema.NonEmptyArray(SceneId).annotate({
      description: 'The scenes to probe; adjacent scenes play one after another',
    }),
    from: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).annotate({
        description: "The first finding to list: a previous answer's next.from (0)",
      }),
    ),
    report: Schema.optionalKey(
      Schema.String.annotate({
        description: "The report that from is a place in: a previous answer's next.report",
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
    return checkReport(answer.stdout, params);
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// film.cues

/** Where a cues result starts, or goes on: a line of the CLI's output, and a character in it (both from 1). */
const CuesCursor = Schema.Struct({ from: Schema.Int, column: Schema.Int });

const CuesOutput = Schema.Struct({
  /**
   * Where `lines` starts: the line of the CLI's output and the character in
   * it. A column past 1 goes on inside the line the last result stopped in.
   */
  from: Schema.Int,
  column: Schema.Int,
  /** How many lines the CLI printed. */
  total: Schema.Int,
  /** The lines from `from`/`column`, whole: the last is cut only when it alone is longer than a result. */
  lines: Schema.Array(Schema.String),
  /** The CLI's words when a cue ends after its scene (`CuesLate`): the lines still stand. */
  late: Schema.optionalKey(Schema.String),
  /** Present with `next`: what was left out to fit, and how to read it. */
  rest: Schema.optionalKey(Schema.String),
  /** Present when the lines go on: the `from` and `column` that read the rest. */
  next: Schema.optionalKey(CuesCursor),
});
type CuesOutput = typeof CuesOutput.Type;
const cuesLength = encodedLength(CuesOutput);

/**
 * The cues result for the CLI's `stdout` from line `from`, character
 * `column`: every whole line that fits, or, when the first alone is longer
 * than a result, as much of it as fits; and `next` where the rest starts. No
 * line is cut and dropped: what a result leaves out the next one reads.
 */
export const cuesReport = (
  stdout: string,
  late: Option.Option<string>,
  cursor: { readonly from?: number; readonly column?: number },
): CuesOutput => {
  const all = linesOf(stdout);
  const from = Math.max(1, Math.min(cursor.from ?? 1, all.length));
  const column = Math.max(1, Math.min(cursor.column ?? 1, (all[from - 1] ?? '').length + 1));
  const lines = [
    ...all.slice(from - 1, from).map((first) => first.slice(column - 1)),
    ...all.slice(from),
  ];
  const base = {
    from,
    column,
    total: all.length,
    ...Option.match(late, {
      onNone: () => ({}),
      onSome: (text) => ({ late: clip(text, REFUSAL_CHARS) }),
    }),
  };
  const restOf = (left: number) =>
    `${left} more lines left out to fit: call film.cues again with next.from and next.column`;
  const fits = (output: CuesOutput) => cuesLength(output) <= RESULT_BUDGET;
  const count = largestFitting(lines.length, (size) =>
    fits({
      ...base,
      lines: lines.slice(0, size),
      rest: restOf(FAR),
      next: { from: FAR, column: 1 },
    }),
  );
  if (count === lines.length) return { ...base, lines };
  if (count > 0)
    return {
      ...base,
      lines: lines.slice(0, count),
      rest: restOf(lines.length - count),
      next: { from: from + count, column: 1 },
    };
  // The first line alone is longer than a result: as much of it as fits.
  const first = lines[0] ?? '';
  const rest = `line ${from} goes on past this result: call film.cues again with next.from and next.column`;
  let size = largestFitting(first.length, (chars) =>
    fits({
      ...base,
      lines: [first.slice(0, chars)],
      rest,
      next: { from: FAR, column: FAR },
    }),
  );
  if (size > 1 && isHighSurrogate(first.charCodeAt(size - 1))) size -= 1;
  size = Math.max(1, size);
  return {
    ...base,
    lines: [first.slice(0, size)],
    rest,
    next: { from, column: column + size },
  };
};

export const FilmCues = tool({
  id: 'film.cues',
  description:
    "A scene's placement and its marks and named cues with their times (film cues): start=, dur=, speech=, seam= to the next voice, and each {mark} at its film second. Without a scene, every scene. Lines come whole: when the answer has `next`, ask again with its `from` and `column` for the rest (a column past 1 goes on inside a line)",
  readonly: true,
  params: Schema.Struct({
    film: FilmName,
    scene: Schema.optionalKey(SceneId),
    from: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The line to start at (1): a previous answer's next.from",
      }),
    ),
    column: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The character of that line to start at (1): a previous answer's next.column",
      }),
    ),
  }),
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
      params,
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

/** The longest one journal line a result keeps: the whole journal reads with gent's `read`. */
const LINE_CHARS = 800;

const JournalOutput = Schema.Struct({
  lines: Schema.Array(Schema.String),
  /** Present when older lines were left out to fit: how many, and how to read them. */
  earlier: Schema.optionalKey(Schema.String),
});
type JournalOutput = typeof JournalOutput.Type;
const journalLength = encodedLength(JournalOutput);

/** `film`'s journal result for the CLI's `stdout`: the newest lines that fit, and how to read the older. */
export const journalReport = (film: string, stdout: string): JournalOutput => {
  const lines = linesOf(stdout).map((line) => clip(line, LINE_CHARS));
  const earlierOf = (count: number) =>
    `${lines.length - count} earlier lines left out to fit: read path ${FILMS_FOLDER}/${film}/journal.md reads the whole journal`;
  const count = largestFitting(
    lines.length,
    (size) =>
      journalLength({ lines: lines.slice(lines.length - size), earlier: earlierOf(0) }) <=
      RESULT_BUDGET,
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
      return journalReport(params.film, answer.stdout);
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
    return journalReport(params.film, answer.stdout);
  }, Effect.mapError(modelFailure)),
});

// ---------------------------------------------------------------------------
// The scene painter.

export const PAINTER = AgentName.make('scene-painter');

/** The film skill's rules, from the checkout's root: the painter reads them, never writes them. */
const SKILL_FOLDER = '.claude/skills/film';

/** The folders the painter's file tools reach: what gent's `paths` take. */
type PainterPaths = NonNullable<AgentDefinition['paths']>;

/**
 * The paths of one painter run on `film`: its own folder to write, the film
 * skill to read. `film.paint` admits each painter session with these as its
 * `paths` run override, so a run's scope holds by construction, not by a
 * caller remembering it. An override only narrows the definition's paths,
 * so no run of the painter reaches past the films and the skill; a session
 * started any other way (`delegate.start`) is held to the films, not to one.
 */
export const painterPaths = (film: string): PainterPaths => [
  { path: `${FILMS_FOLDER}/${film}`, access: 'write' },
  { path: SKILL_FOLDER, access: 'read' },
];

/**
 * The painter's brief: the same bytes every turn (it is part of the cached
 * prompt). What changes (the journal, the cues, the stills) comes through
 * the tools, never here.
 */
export const PAINTER_BRIEF = [
  'You paint one scene of a narrated cut-paper film: its drawing, in apps/animations/src/films/<film>/scenes/<scene>.ts and the film files it reads. The user names the film and the scene.',
  '',
  'Your tools are these and no others: read and grep (the film folder and the film skill), write and edit (the film folder only), film.cues, film.look, film.journal and film.check. A path is from the repository root: apps/animations/src/films/<film>/ for the film, .claude/skills/film/ for the skill. grep takes a path inside them.',
  '',
  'Work in passages:',
  '1. Read first. film.journal op=read for the scene: what was noticed before. film.cues for the scene: its marks and named cues with their times. read apps/animations/src/films/<film>/scenes/<scene>.ts, the beat in script.ts, and what the scene imports from the film folder.',
  '2. Paint one passage: a figure placed, a framing, a light, a line of type. Pin every motion to a mark or a named cue, never to a hand-timed second.',
  '3. Look after every passage, before the next one: film.look at the marks and at the middle of each cue that moves something (mark:<name>, cue:<name>@0.5). mode value checks the light and dark, mode squint where the eye lands first, crop a face, a hand or lettering at 1:1. Read every still.',
  '4. Note what a look taught in the journal (film.journal op=note, with the scene): what is, never what to do. A decision lands in the source; a request for the owner is not a journal entry.',
  '5. Before you finish, film.check the scenes you touched. Fix each finding in the scene, or say why it stands.',
  '',
  'The rules live in files, never in your memory. read them: .claude/skills/film/SKILL.md (step 4, Scenes, and the Easel section), .claude/skills/film/CRAFT.md and .claude/skills/film/reference/director-vision.md. What a picture teaches comes from the film folder (script.ts, sources.md, quotes.jsonl), never from what you remember of the subject.',
].join('\n');

/**
 * The scene painter: gent's file tools and the film's, listed whole (no `*`),
 * so bash, the cell and every other tool stay out; `paths` confines only the
 * file tools, and is no sandbox. It does not hold `film.paint`: a painter
 * starts no painter. Its `paths` are the wide default, every film to write:
 * gent's paths are fixed folders, so the definition cannot name the one film
 * a run paints. `film.paint` starts each run on one film, with
 * `painterPaths(film)` as its override.
 */
export const scenePainter = AgentDefinition.make({
  name: PAINTER,
  description:
    'Paints one scene of a film in apps/animations: reads its cues and journal, paints a passage, looks, notes what it saw, checks. One run paints one film, started by film.paint with painterPaths(film) as its paths override',
  systemPromptAddendum: PAINTER_BRIEF,
  tools: ['read', 'grep', 'write', 'edit', 'film.cues', 'film.look', 'film.journal', 'film.check'],
  paths: [
    { path: FILMS_FOLDER, access: 'write' },
    { path: SKILL_FOLDER, access: 'read' },
  ],
});

// ---------------------------------------------------------------------------
// film.paint: one painter run on one film.

const PaintOutput = Schema.Struct({
  /** The painter's session, a child of the caller's, and its branch. */
  sessionId: SessionId,
  branchId: BranchId,
  /** How to follow the run. */
  follow: Schema.String,
});

/** The painter's opening message: the film and the scene, and the caller's brief when one was given. */
const paintTask = (film: string, scene: string, brief: Option.Option<string>): string =>
  [
    `Paint the scene ${scene} of the film ${film} (${FILMS_FOLDER}/${film}/scenes/${scene}.ts).`,
    ...Option.toArray(brief),
  ].join('\n\n');

export const FilmPaint = tool({
  id: 'film.paint',
  description:
    "Start a scene painter on one scene of one film: a child session admitted as scene-painter, its file tools held to that film's folder (and the film skill, to read). Returns at admission with the session's id, never the painting; the painter works on beside you",
  destructive: true,
  params: Schema.Struct({
    film: FilmName,
    scene: SceneId,
    brief: Schema.optionalKey(
      Schema.String.annotate({
        description: 'What the painter is to do in the scene, beyond its brief: one passage, a fix',
      }),
    ),
  }),
  output: PaintOutput,
  summary: (input) => `${input.film}/${input.scene}`,
  execute: Effect.fn('film.paint')(function* (params) {
    const ctx = yield* ExtensionContext;
    // The film and the scene as film.cues reads them: an unknown one is
    // refused (FilmUnknown, UnknownScene) before any session is made.
    yield* filmCli('film.paint', ctx.cwd, ['cues', params.film, params.scene], ['CuesLate']);
    const failed = (error: { readonly message: string }) =>
      FilmPaintFailed.make({ film: params.film, scene: params.scene, reason: error.message });
    // The call's id makes the create and the send durable-once: a repeat of
    // this call finds its own painter and admits nothing new.
    const call = Option.fromUndefinedOr(ctx.toolCallId);
    const child = yield* ctx.Session.create({
      name: `paint ${params.film}/${params.scene}`,
      parentBranchId: ctx.branchId,
      admission: { agent: PAINTER, runSpec: { overrides: { paths: painterPaths(params.film) } } },
      ...Option.match(call, {
        onNone: () => ({}),
        onSome: (id) => ({ requestId: RequestId.make(`film.paint:${id}`) }),
      }),
    }).pipe(Effect.mapError(failed));
    yield* ctx.Session.send({
      delivery: 'turn',
      sessionId: child.sessionId,
      branchId: child.branchId,
      content: paintTask(params.film, params.scene, Option.fromUndefinedOr(params.brief)),
      completion: 'admission',
      ...Option.match(call, {
        onNone: () => ({}),
        onSome: (id) => ({ commandId: ActorCommandId.make(`film.paint:${id}`) }),
      }),
    }).pipe(Effect.mapError(failed));
    return {
      ...child,
      follow: `read_session with sessionId ${child.sessionId} reads the painter's transcript; the session is a child of this one`,
    };
  }, Effect.mapError(modelFailure)),
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
 * paints, the files it wrote, and the lines of its last look. gent's handoff
 * marker, holding an earlier painter notice, carries all three forward (a
 * copy of a notice in any other message carries nothing); a film call, or a
 * write or edit of gent's, after it updates them.
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
});
const decodeCallParams = Schema.decodeUnknownOption(CallParams);
const LookLines = Schema.Struct({ stills: Schema.Array(Schema.Struct({ line: Schema.String })) });
const decodeLookLines = Schema.decodeUnknownOption(LookLines);

/** gent's file tools that change a file. */
const WRITE_TOOLS: ReadonlySet<string> = new Set(['write', 'edit']);

/**
 * What the compactor reads of a write's or an edit's output: the file, as gent
 * resolved it (`{ path, bytesWritten }`, `{ path, replacements }`): absolute,
 * its `..` steps resolved, its links not followed.
 */
const WroteOutput = Schema.Struct({ path: Schema.String });
const decodeWroteOutput = Schema.decodeUnknownOption(WroteOutput);
const isFilmName = Schema.is(FilmName);

/**
 * The film file `inFilms` names, a path from the films folder
 * (`<film>/<path>`): none when it names no film's folder, or the folder
 * alone, or has a `..` step.
 */
const filmFileOf = (inFilms: string): Option.Option<Written> => {
  const [film = '', ...rest] = inFilms.split('/');
  if (!isFilmName(film) || rest.length === 0 || rest.includes('..')) return Option.none();
  return Option.some({ film, path: rest.join('/') });
};

/** The film file at the absolute `file`, when it lies under `films`, the films folder with its trailing separator. */
const writtenAt = (films: string, file: string): Option.Option<Written> =>
  Option.flatMap(
    Option.liftPredicate(file, (path) => path.startsWith(films)),
    (path) => filmFileOf(path.slice(films.length)),
  );

/** The first words of a painter notice: how a later compaction finds an earlier one. */
const NOTICE_HEADER =
  'Earlier parts of this session were condensed. What follows is read from the files as they stand now.';

/** A painter notice's scene line. */
const SCENE_LINE = /^film ([a-z0-9][a-z0-9-]*), scene ([a-z0-9][a-z0-9-]*)$/m;

/** A painter notice's line for a file written: its path from the films folder, then its size or absence. */
const WRITTEN_LINE = /^apps\/animations\/src\/films\/(.+) \((?:\d+ bytes|not there now)\)$/;

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
          body
            .split('\n')
            .flatMap((line) =>
              Option.toArray(
                Option.flatMap(Option.fromUndefinedOr(WRITTEN_LINE.exec(line)?.[1]), filmFileOf),
              ),
            ),
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

/**
 * `trail` after one call: its place, the film file it wrote, the stills it
 * answered with. A write or an edit counts by the file its output names,
 * never its params, and only a file in a film's folder under `films`.
 */
const afterCall = (
  trail: Trail,
  films: string,
  name: string,
  params: typeof CallParams.Type,
  result: Option.Option<{ readonly value: unknown; readonly failed: boolean }>,
): Trail => {
  const wrote = Option.flatMap(
    Option.filter(result, (answer) => WRITE_TOOLS.has(name) && !answer.failed),
    (answer) =>
      Option.flatMap(decodeWroteOutput(answer.value), (output) => writtenAt(films, output.path)),
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

/**
 * The trail an earlier compaction handed over, when `message` is gent's
 * handoff marker (`contextWindowOf`: a window the runtime opened, with the
 * summary of the history it replaced) carrying a painter notice. Its words
 * alone prove nothing: a summary copied into a user's or the model's message
 * opens no window, and a bare window marker summarized nothing.
 */
const handoffTrail = (message: Message): Option.Option<Trail> =>
  Option.flatMap(contextWindowOf(message), (window) =>
    Option.flatMap(Option.fromUndefinedOr(window.summarized), () => noticeTrail(window.notice)),
  );

/**
 * The trail of `messages`, oldest first: gent's handoff marker seeds it with
 * what the earlier notice carried, and each film call, write or edit after
 * updates it. `films` is the films folder, absolute, with its trailing
 * separator.
 */
const trailOf = (films: string, messages: ReadonlyArray<Message>): Trail => {
  const results = new Map(
    messages.flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== 'tool-result') return [];
        return [[part.id, { value: part.result, failed: part.isFailure }] as const];
      }),
    ),
  );
  return messages.reduce(
    (seeded: Trail, message) =>
      message.parts.reduce(
        (trail: Trail, part) => {
          if (part.type !== 'tool-call') return trail;
          if (!part.name.startsWith('film.') && !WRITE_TOOLS.has(part.name)) return trail;
          return afterCall(
            trail,
            films,
            part.name,
            Option.getOrElse(decodeCallParams(part.params), () => ({})),
            Option.fromUndefinedOr(results.get(part.id)),
          );
        },
        Option.getOrElse(handoffTrail(message), () => seeded),
      ),
    NO_TRAIL,
  );
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
  const path = yield* Path.Path;
  const shown = `${FILMS_FOLDER}/${film}/${given}`;
  return yield* fs.stat(path.join(root, shown)).pipe(
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
  const path = yield* Path.Path;
  const trail = trailOf(`${path.join(root, FILMS_FOLDER)}${path.sep}`, [
    ...request.history,
    ...request.kept,
  ]);
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
 * The compactor for the checkout each compacted session runs in: a scene painter's window is
 * condensed from the files with no model call; any other agent's is refused
 * (`ModelCompactionError`), so the next compactor in the chain (gent's own)
 * summarizes it.
 */
export const painterCompactor = Layer.effect(
  ModelContextCompactor,
  Effect.gen(function* () {
    const services = yield* Effect.context<
      FileSystem.FileSystem | Path.Path | ChildProcessSpawner
    >();
    return ModelContextCompactor.of({
      // Run with the compacted session's context: its cwd is the checkout it paints in.
      compact: (request) => {
        if (request.agentName !== PAINTER)
          return Effect.fail(
            ModelCompactionError.make({
              modelId: request.modelId,
              reason: `the film compactor serves only ${PAINTER}`,
            }),
          );
        return Effect.flatMap(ExtensionContext, (ctx) => painterNotice(ctx.cwd, request)).pipe(
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
    yield* host.register('tool', FilmLook, FilmCheck, FilmCues, FilmJournal, FilmPaint);
    yield* host.register('agent', scenePainter);
    yield* host.register(
      'resource',
      defineResource({
        id: 'film/painter-compactor',
        scope: 'process',
        layer: painterCompactor,
      }),
    );
  }),
});
