// `film`: the tools that turn a film's script into sound and pictures, run
// from the app that holds the films. The app owns its entry (`runFilmCli`): it
// names its films folder and serves its player page, which imports the same
// folder, so the tools and the page always read one film.
//
//   film narrate | takes import | script | score | mix       the voice and the sound
//   film sfx …        (sfx-cli.ts)     the app's sound library
//   film media …      (media-cli.ts)   the app's private media store
//   film cues | check | doctor                                 read and check a film
//   film render | lookbook | chapters                          pictures and video
//   film project …    (project-cli.ts) a film's scenes rendered, approved, commented
//   film options …    (choices-cli.ts) a film's choice points, read fresh for the review
//   film read …       (read-cli.ts)    the studio's reading and a cue, read fresh for the lab
//   film lab | review                                          the servers (Ctrl-C stops them)
//   film notes …      (notes-cli.ts)   the lab's notes, from the terminal
//
// Each command's flags are its own `--help`.
//
// narrate and score finish with a mix, so the track is always rebuilt from the
// same inputs; mix alone never calls a paid API.

import { BunHttpPlatform, BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Cause,
  Console,
  Context,
  Effect,
  Layer,
  Logger,
  Option,
  Path,
  Predicate,
  Result,
  Runtime,
  Schema,
  Stdio,
} from 'effect';
import type { FileSystem } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';
import type { ChildProcessSpawner } from 'effect/process';
import { type AddressFlags, type Scope, addressOf, resolveAddress } from '../core/address.ts';
import { type Placed, scenesOf } from '../core/layout.ts';
import { sheetBeats, sheetMarkdown } from '../core/sheet.ts';
import type { Short } from '../core/schema.ts';
import { SAFE_ZONE_NAMES, SHORT_RULES, type SafeZoneName } from '../core/shorts.ts';
import { acceptedBeats, atTheCommandLine, bareAcceptMismatch } from './accept.ts';
import { Browser, browserReady } from './browser.ts';
import { HOLD } from './check.ts';
import { CHECK_RULES, layoutLeg, shortLeg, soundLeg, staticLeg } from './film-check.ts';
import { type Finding, type Report, lineOf, report } from './findings.ts';
import { Checker } from './checker.ts';
import { filmChapters, lookLines } from './look.ts';
import { Looker } from './looker.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { CUES_RULES, sceneReport, shortReport, soundReport } from './cues.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type BrowserFailed,
  type BrowserMissing,
  CheckFailed,
  CuesLate,
  type ElevenLabsFailed,
  type MediaFailed,
  PreviewServerFailed,
  SoundMissing,
} from './errors.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { Media, ffmpegReady } from './media.ts';
import { Mixer } from './mixer.ts';
import { writeSheet } from './script-sheet.ts';
import { Takes } from './takes.ts';
import { Narrator, planNarration, stateLine, voicedOf } from './narrator.ts';
import type { LabHandler } from './api-server.ts';
import { labHandler } from './lab.ts';
import { Review, type ReviewRoot } from './review.ts';
import { reviewAllowed, reviewHandler } from './review-http.ts';
import { NotesStore } from './notes-store.ts';
import { notes } from './notes-cli.ts';
import { read } from './read-cli.ts';
import { StudioReadings } from './studio.ts';
import { type LabServer, PreviewServer, type PreviewServerService } from './preview-server.ts';
import {
  DRAW_WORKERS,
  HARDWARE_WORKERS,
  RenderJob,
  SOFTWARE_WORKERS,
  flagConflicts,
  givenFlags,
  jobOf,
} from './render-plan.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { media } from './media-cli.ts';
import { SourceWriter } from './source-writer.ts';
import { Choices } from './choices.ts';
import { options } from './choices-cli.ts';
import { CheckLineJson, FreshFilm } from './fresh-film.ts';
import { sfx } from './sfx-cli.ts';
import { PrivateStore } from './private-store.ts';
import { SoundLibrary } from './library.ts';
import { type EncoderReadyError, Renderer, encoderReady } from './renderer.ts';
import { RenderCatalogue } from './catalogue.ts';
import { project, renderAndRecord, variantFlag } from './project-cli.ts';
import { Stamps, stampOf } from './stamp.ts';
import { EncoderName, encoderNamed } from '../core/encoder.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** `--only a,b` as a set of ids. */
const only = Flag.String('only').pipe(
  Flag.optional,
  Flag.map(Option.map((ids: string) => new Set(ids.split(',')))),
);
/** `--scene a,b`: scenes by id, for `check` and `render`. */
const scenes = Flag.String('scene').pipe(
  Flag.optional,
  Flag.map(Option.map((ids: string) => ids.split(','))),
);
/** `--short <id>`: one of the film's shorts (`shorts.ts`). */
const short = Flag.String('short').pipe(Flag.optional);

/**
 * The part of the film the address flags name (`addressOf`), resolved once
 * against the film's layout (`resolveAddress`), so a misspelt act, scene,
 * short, mark or cue fails before a page or a browser starts. A short is only
 * checked here, on the film's clock: its page resolves it on its own frame
 * rate (`Checker.cut`, the renderer).
 */
const scopeOf = (loaded: LoadedFilm, placed: ReadonlyArray<Placed>, flags: AddressFlags) =>
  Effect.fromResult(
    Result.flatMap(addressOf(flags), (address) =>
      resolveAddress(
        { name: loaded.paths.name, placed, look: loaded.look, shorts: loaded.shorts },
        address,
      ),
    ),
  );

/** `--act <name>`: one of the film's acts (`look.acts`). */
const act = Flag.String('act').pipe(Flag.optional);

/**
 * `--accept-mismatch a,b`: the beats that may keep a take whose transcript
 * does not match; bare, the `--only` beats (`accept.ts`).
 */
const acceptMismatch = (what: string) =>
  Flag.String('accept-mismatch').pipe(
    Flag.optional,
    Flag.withDescription(
      `keep a ${what} whose transcript does not match, for these beats (id,id); bare, for the --only beats`,
    ),
  );
const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDefault(false),
  Flag.withDescription('print what would be generated, then stop'),
);

/** What a paid run needs before it spends a credit: a logged-in CLI. The remix after it runs in-process. */
const paidPreflight = Effect.gen(function* () {
  yield* (yield* ElevenLabs).ready;
});

/** How a doctor check can fail: a tool missing or broken. */
type ToolError =
  | BrowserMissing
  | BrowserFailed
  | ElevenLabsFailed
  | MediaFailed
  | EncoderReadyError
  | PreviewServerFailed;
/** What a doctor check needs from the platform. */
type ToolNeeds = Path.Path | ChildProcessSpawner.ChildProcessSpawner;

interface ToolCheck<E, R> {
  readonly tool: string;
  /** The commands that need it. */
  readonly needed: string;
  /** What it found, said after `ok` (empty when there is nothing to add). */
  readonly run: Effect.Effect<string, E, R>;
}

/** A doctor line: `ok` and what was found, or `missing` and why. */
const toolLine = (
  { tool, needed }: { readonly tool: string; readonly needed: string },
  result: Result.Result<string, { readonly message: string }>,
) =>
  Result.match(result, {
    onSuccess: (found) =>
      `ok      ${tool.padEnd(11)} (${needed})${Arr.map(
        Arr.filter([found], (f) => f !== ''),
        (f) => `: ${f}`,
      ).join('')}`,
    onFailure: (error) => `missing ${tool.padEnd(11)} (${needed}): ${error.message}`,
  });

/**
 * The doctor. The encoder check serves the app's own player, as `render`
 * does; a player that does not start fails that line alone
 * (`PreviewServerFailed`), and every other line still prints.
 */
const doctor = <E, R>(previewServer: Layer.Layer<PreviewServer, E, R>) => {
  const served = previewServer.pipe(
    Layer.catchCause((cause) =>
      Layer.effect(
        PreviewServer,
        Effect.fail(PreviewServerFailed.make({ reason: Cause.pretty(cause) })),
      ),
    ),
  );
  const encoderCheck = encoderReady.pipe(Effect.provide(served));
  return Command.make(
    'doctor',
    {},
    Effect.fn('film.doctor')(function* () {
      const elevenLabs = yield* ElevenLabs;
      const checks: ReadonlyArray<ToolCheck<ToolError, ToolNeeds | R>> = [
        { tool: 'chromium', needed: 'render, check', run: Effect.as(browserReady, '') },
        { tool: 'encoder', needed: 'render', run: encoderCheck },
        { tool: 'elevenlabs', needed: 'narrate, score', run: Effect.as(elevenLabs.ready, '') },
        {
          tool: 'ffmpeg',
          needed: 'the share copy of a software render',
          run: Effect.as(ffmpegReady(), ''),
        },
      ];
      const results = yield* Effect.forEach(checks, (c) => Effect.result(c.run), {
        concurrency: checks.length,
      });
      for (const [check, result] of Arr.zip(checks, results))
        yield* Console.log(toolLine(check, result));
      const failure = Arr.head(Arr.getFailures(results));
      if (Option.isSome(failure)) return yield* failure.value;
    }),
  ).pipe(
    Command.withDescription(
      "Check the tools the film commands need: headless Chromium and the H.264 encoder it renders with, the elevenlabs CLI and its login, and ffmpeg (x264 for a software render's share copy)",
    ),
  );
};

const narrate = Command.make(
  'narrate',
  {
    film,
    only: only.pipe(Flag.withDescription('record just these beats, current or not')),
    force: Flag.Boolean('force').pipe(
      Flag.withDefault(false),
      Flag.withDescription('record every beat'),
    ),
    dryRun,
    acceptMismatch: acceptMismatch('staging take'),
    replaceRecorded: Flag.Boolean('replace-recorded').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "stage a beat whose recorded take is stale (its line changed), replacing the person's take",
      ),
    ),
  },
  Effect.fn('film.narrate')(function* (input) {
    const repo = yield* FilmRepo;
    const narrator = yield* Narrator;
    const loaded = yield* repo.load(input.film);
    // A misspelt beat fails here rather than recording nothing.
    yield* Option.match(input.only, {
      onNone: () => Effect.void,
      onSome: (ids) =>
        placeFilm(loaded).pipe(
          Effect.flatMap((placed) => Effect.fromResult(scenesOf(placed, [...ids]))),
        ),
    });
    const options = {
      only: input.only,
      force: input.force,
      acceptMismatch: yield* Effect.fromResult(
        acceptedBeats(
          input.acceptMismatch,
          input.only,
          loaded.scenes.map((s) => s.id),
        ),
      ),
      replaceRecorded: input.replaceRecorded,
    };
    const plan = yield* Effect.fromResult(planNarration(loaded, options));
    const stale = plan.stale.map((b) => b.id).join(',') || 'none';
    yield* Effect.log(
      `narrate.plan film=${input.film} beats=${plan.beats.length} to_record=${stale}`,
    );
    // A person's reading of a beat that was renamed or cut: kept, and said.
    for (const orphan of plan.orphaned)
      yield* Effect.logWarning(
        `narrate.orphaned id=${orphan.id} file=${orphan.file} reason="a recorded take for no beat; move its key in timings.json to the beat it reads"`,
      );
    if (input.dryRun) {
      for (const take of plan.states) yield* Console.log(stateLine(take));
      for (const orphan of plan.orphaned)
        yield* Console.log(`orphaned  ${orphan.id} (${orphan.file}, recorded take, no beat)`);
      return;
    }
    // Before the first paid take: the CLI must be logged in.
    yield* paidPreflight;
    yield* narrator.record(loaded, plan, options);
    yield* (yield* Mixer).mix(input.film, { stems: false, score: Option.none() });
  }),
).pipe(Command.withDescription("Record a film's stale narration takes, then remix"));

const score = Command.make(
  'score',
  {
    film,
    force: Flag.Boolean('force').pipe(
      Flag.withDefault(false),
      Flag.withDescription('compose again even when current'),
    ),
    option: Flag.String('option').pipe(
      Flag.optional,
      Flag.withDescription('just this score option; every stale one otherwise'),
    ),
    cap: Flag.Int('cap').pipe(
      Flag.optional,
      Flag.withDescription('the most credits spent in all, counting what --tally records'),
    ),
    tally: Flag.String('tally').pipe(
      Flag.optional,
      Flag.withDescription(
        'a TSV each composed option is appended to: name, hash, seconds, credits',
      ),
    ),
    dryRun,
  },
  Effect.fn('film.score')(function* (input) {
    const repo = yield* FilmRepo;
    const composer = yield* Composer;
    const loaded = yield* repo.load(input.film);
    if (!input.dryRun) yield* paidPreflight;
    yield* composer.score(loaded, {
      force: input.force,
      dryRun: input.dryRun,
      only: input.option,
      cap: input.cap,
      tally: input.tally,
    });
    if (input.dryRun) return;
    // Generated music may not sit in the public repo: into the private store at once.
    yield* (yield* SoundLibrary).push(yield* repo.scores, Option.none());
    yield* (yield* Mixer).mix(input.film, { stems: false, score: Option.none() });
  }),
).pipe(
  Command.withDescription(
    "Compose a film's stale score options, keep them in the private store, then remix (effects and beds are the library's: sfx make)",
  ),
);

const mix = Command.make(
  'mix',
  {
    film,
    stems: Flag.Boolean('stems').pipe(
      Flag.withDefault(false),
      Flag.withDescription('also write voice, music and effects stems to out/<film>/stems'),
    ),
    score: Flag.String('score').pipe(
      Flag.optional,
      Flag.withDescription('play this score option in place of the one the score names'),
    ),
  },
  Effect.fn('film.mix')(function* (input) {
    yield* (yield* Mixer).mix(input.film, { stems: input.stems, score: input.score });
  }),
).pipe(
  Command.withDescription(
    'Rebuild narration/full.wav, the mixed track, from the current takes and sound',
  ),
);

const takesImport = Command.make(
  'import',
  {
    film,
    path: Argument.String('path').pipe(
      Argument.withDescription(
        'a folder of recordings named <beat>.wav|m4a|mp3, or one recording (named for its beat, or --only it)',
      ),
    ),
    only: only.pipe(
      Flag.withDescription(
        'import just these beats; one recording named otherwise imports as the one beat named',
      ),
    ),
    acceptMismatch: acceptMismatch('take'),
    whole: Flag.Boolean('whole').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'the file is one reading of the whole script: find each beat in it and cut at the quietest silence around it',
      ),
    ),
  },
  Effect.fn('film.takes.import')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const at = (yield* Path.Path).resolve(input.path);
    // A misspelt or bare-without---only flag fails before a credit is spent.
    const accepted = yield* Effect.fromResult(
      acceptedBeats(
        input.acceptMismatch,
        input.only,
        loaded.scenes.map((s) => s.id),
      ),
    );
    // Every take is transcribed back: the CLI must be logged in.
    yield* paidPreflight;
    const voiced = yield* Effect.fromResult(voicedOf(loaded));
    const imported = yield* (yield* Takes).importPath(voiced, at, {
      only: input.only,
      acceptMismatch: accepted,
      whole: input.whole,
    });
    for (const beat of imported)
      yield* Console.log(
        `recorded  ${beat.id.padEnd(14)} ${beat.take.file}  ${beat.take.duration.toFixed(2)}s  wer ${(beat.wer * 100).toFixed(1)}%`,
      );
    yield* (yield* Mixer).mix(input.film, { stems: false, score: Option.none() });
  }),
).pipe(
  Command.withDescription(
    "Import a person's recordings as the film's takes (trimmed, levelled, transcribed and timed as staging takes are), then remix",
  ),
);

const takes = Command.make('takes').pipe(
  Command.withDescription("A person's narration takes: import recordings over the staging voice"),
  Command.withSubcommands([takesImport]),
);

const script = Command.make(
  'script',
  {
    film,
    sheet: Flag.Boolean('sheet').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'write out/<film>/script-sheet.md and a page to print, script-sheet.html',
      ),
    ),
  },
  Effect.fn('film.script')(function* (input) {
    const repo = yield* FilmRepo;
    const loaded = yield* repo.load(input.film);
    const lines = yield* repo.script(input.film);
    if (!input.sheet) {
      const beats = Option.getOrElse(lines, () =>
        loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
      );
      const sheet = yield* Effect.fromResult(sheetBeats(beats, []));
      return yield* Console.log(sheetMarkdown(input.film, sheet));
    }
    const written = yield* writeSheet(loaded, lines);
    yield* Console.log(written.markdown);
    yield* Console.log(written.html);
  }),
).pipe(
  Command.withDescription(
    'Print the reading sheet: each beat with the file to save its take as, marks stripped, quotations set apart (--sheet writes it, with its sources, to out/<film>)',
  ),
);

const cues = <E, R>(checkLayer: Layer.Layer<Checker, E, R>) => {
  /** The short on its page's frames: the rate the film declares, read from its page. */
  const onPage = Effect.fn('film.cues.short')(function* (loaded: LoadedFilm, declared: Short) {
    return yield* (yield* Checker).cut(loaded, declared);
  }, Effect.provide(checkLayer));
  return Command.make(
    'cues',
    {
      film,
      scene: Argument.String('scene').pipe(
        Argument.optional,
        Argument.withDescription('only this scene'),
      ),
      sound: Flag.Boolean('sound').pipe(
        Flag.withDefault(false),
        Flag.withDescription("print each effect placement's film time instead"),
      ),
      short: short.pipe(
        Flag.withDescription("print this short's spans in film time, and its length, instead"),
      ),
    },
    Effect.fn('film.cues')(function* (input) {
      yield* Effect.fromResult(
        flagConflicts(
          givenFlags({
            short: input.short,
            sound: Option.liftPredicate(input.sound, Boolean),
            scene: input.scene,
          }),
          CUES_RULES,
        ),
      );
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      const scope = yield* scopeOf(loaded, placed, {
        act: Option.none(),
        scene: Option.none(),
        short: input.short,
      });
      if (Option.isSome(scope.short)) {
        for (const line of shortReport(yield* onPage(loaded, scope.short.value)))
          yield* Console.log(line);
        return;
      }
      if (input.sound) {
        const sound = yield* Effect.fromOption(loaded.sound, () =>
          SoundMissing.make({ film: input.film }),
        );
        const lines = yield* Effect.fromResult(soundReport(sound, placed, input.scene));
        for (const line of lines) yield* Console.log(line);
        return;
      }
      const report = yield* Effect.fromResult(sceneReport(placed, input.scene));
      for (const line of report.lines) yield* Console.log(line);
      if (report.late > 0) return yield* CuesLate.make({ count: report.late });
    }),
  ).pipe(
    Command.withDescription(
      "Print each scene's placement, marks and named cues; fails when a cue ends after its scene",
    ),
  );
};

const encodeCheckLine = Schema.encodeSync(CheckLineJson);

const check = <E, R>(checkLayer: Layer.Layer<Checker | Looker, E, R>) => {
  const layout = Effect.fn('film.check.layout')(function* (
    loaded: LoadedFilm,
    scope: Scope,
    workers: number,
  ) {
    return yield* layoutLeg(loaded, scope, workers);
  }, Effect.provide(checkLayer));
  const onShort = Effect.fn('film.check.short')(function* (
    loaded: LoadedFilm,
    declared: Short,
    input: { readonly static: boolean; readonly workers: number; readonly zone: SafeZoneName },
  ) {
    return yield* shortLeg(loaded, declared, input);
  }, Effect.provide(checkLayer));
  return Command.make(
    'check',
    {
      film,
      static: Flag.Boolean('static').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'only what the files tell: cues, takes, sounds and the master on disk; no mix and no browser (the lab runs this after each write)',
        ),
      ),
      sound: Flag.Boolean('sound').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'the static leg and the mix the film makes now (dead air, balance), without the browser',
        ),
      ),
      allowStale: Flag.Boolean('allow-stale').pipe(
        Flag.withDefault(false),
        Flag.withDescription('report stale takes, sounds and audio master as warnings, not errors'),
      ),
      scene: scenes.pipe(Flag.withDescription('probe the layout of just these scenes (id,id)')),
      act: act.pipe(
        Flag.withDescription("probe the layout of this act's scenes, and judge its colour script"),
      ),
      json: Flag.Boolean('json').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'print each finding as one line of JSON (level, tag, message, and its address: scene, time)',
        ),
      ),
      workers: Flag.Int('workers').pipe(
        Flag.withDefault(4),
        Flag.withDescription('pages probing at once'),
      ),
      short: short.pipe(Flag.withDescription('check this short (shorts.ts), not the film')),
      zone: Flag.Literals('zone', SAFE_ZONE_NAMES).pipe(
        Flag.withDefault('default'),
        Flag.withDescription(
          "the platform's safe zone a short's text is held to: default (the feed) or ads (the bottom 35% covered)",
        ),
      ),
    },
    Effect.fn('film.check')(function* (input) {
      yield* Effect.fromResult(
        flagConflicts(
          givenFlags({
            static: Option.liftPredicate(input.static, Boolean),
            sound: Option.liftPredicate(input.sound, Boolean),
            short: input.short,
          }),
          CHECK_RULES,
        ),
      );
      const options = { allowStale: input.allowStale };
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      // A misspelt act, scene or short fails here, in either leg, rather than probing nothing.
      const scope = yield* scopeOf(loaded, placed, input);
      if (Option.isSome(scope.short)) {
        const declared = scope.short.value;
        const found = yield* onShort(loaded, declared, input);
        return yield* printReport(declared.id, 'short', report(found, options), input.json);
      }
      const found: Array<Finding> = [...(yield* staticLeg(loaded, placed))];
      if (!input.static) found.push(...(yield* soundLeg(loaded, placed)));
      if (!input.static && !input.sound)
        found.push(...(yield* layout(loaded, scope, input.workers)));
      yield* printReport(input.film, 'film', report(found, options), input.json);
    }),
  ).pipe(
    Command.withDescription(
      `Check a film: cues inside their scenes, sound cues that resolve, current takes and sounds and a master mixed for the film as it is, no text over text or off the frame at any mark or cue, and a warning where the voice speaks over a still picture for more than ${HOLD} s; no dead air in the mix the film makes now, and warnings where a scene holds still for most of its seconds, no face reaches human scale, an act misses its colour script, or the ending leaves no room for end screens. With --short <id>, check that short instead: text inside the platform's safe zone (--zone), a hook in the first ${SHORT_RULES.motionBy} s, a clean loop and a length of at most ${SHORT_RULES.length.max} s`,
    ),
  );
};

/** Print each finding (a line, or a line of JSON), log the count, and fail on any error. */
const printReport = Effect.fn('film.check.report')(function* (
  name: string,
  what: 'film' | 'short',
  found: Report,
  json: boolean,
) {
  for (const reported of found.findings) {
    const { level, finding } = reported;
    if (json) yield* Console.log(encodeCheckLine(lineOf(reported)));
    else yield* Console.log(`${level.padEnd(7)} ${finding._tag.padEnd(12)} ${finding.message}`);
  }
  const { errors, warnings } = found;
  yield* Effect.log(`check.done ${what}=${name} errors=${errors} warnings=${warnings}`);
  if (errors > 0) return yield* CheckFailed.make({ errors, warnings });
});

/** `--stills 3,10.5`: seconds, each a finite number. */
const Seconds = Schema.Array(Schema.FiniteFromString);

const render = <E, R>(renderLayer: Layer.Layer<Renderer, E, R>) =>
  Command.make(
    'render',
    {
      film,
      stills: Flag.String('stills').pipe(
        Flag.optional,
        Flag.withDescription('write full-size PNG stills at these seconds (t,t,...)'),
      ),
      contact: Flag.Finite('contact').pipe(
        Flag.optional,
        Flag.withDescription('write a contact sheet, a frame every this many seconds'),
      ),
      scene: scenes.pipe(
        Flag.withDescription("span these scenes (id,id), read from the film's layout"),
      ),
      act: act.pipe(Flag.withDescription("span this act's scenes, read from the film's layout")),
      from: Flag.Finite('from').pipe(Flag.optional, Flag.withDescription('start, in seconds')),
      to: Flag.Finite('to').pipe(Flag.optional, Flag.withDescription('end, in seconds')),
      workers: Flag.Int('workers').pipe(
        Flag.optional,
        Flag.withDescription(
          `pages rendering at once (default: a video, ${HARDWARE_WORKERS} on the hardware encoder and ${SOFTWARE_WORKERS} on the software one, within one a core; stills, ${DRAW_WORKERS})`,
        ),
      ),
      scale: Flag.Finite('scale').pipe(
        Flag.optional,
        Flag.withDescription('scale the video, e.g. 0.5 (default 1)'),
      ),
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(true),
        Flag.withDescription('burn the captions in (--no-captions to leave them out)'),
      ),
      variant: variantFlag,
      out: Flag.String('out').pipe(
        Flag.optional,
        Flag.withDescription(
          'write the video to this file instead, outside the project folder and its catalogue (default out/<film>/<address>/<variant>.mp4)',
        ),
      ),
      share: Flag.Boolean('share').pipe(
        Flag.optional,
        Flag.withDescription(
          'also write a smaller copy to send, <out>.share.mp4 (default; --no-share to skip it)',
        ),
      ),
      encoder: Flag.Literals('encoder', EncoderName.literals).pipe(
        Flag.optional,
        Flag.map(Option.map(encoderNamed)),
        Flag.withDescription(
          "encode with this H.264 encoder only (default: hardware on macOS, software elsewhere); software on a Mac changes the film's look",
        ),
      ),
      short: short.pipe(
        Flag.withDescription(
          'render this short instead: its spans back to back at 1080×1920, to out/<film>/shorts/<id>/<variant>.mp4 (--from/--to in its seconds)',
        ),
      ),
    },
    Effect.fn('film.render')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      // `--act` and `--scene` set the range from the film's own layout; `--short` cuts to it.
      const scope = yield* scopeOf(loaded, placed, input);
      const stills = yield* Option.match(input.stills, {
        onNone: () => Effect.succeedNone,
        onSome: (list) => Effect.asSome(Schema.decodeEffect(Seconds)(list.split(','))),
      });
      // What it draws, stamped before the first frame: the sources as they stand now.
      const stamp = stampOf(yield* (yield* Stamps).scenes(loaded, placed), scope);
      const job = yield* Effect.fromResult(
        jobOf({
          variant: input.variant,
          captions: input.captions,
          workers: input.workers,
          stills,
          contact: input.contact,
          scope,
          from: input.from,
          to: input.to,
          scale: input.scale,
          out: input.out,
          share: input.share,
          encoder: input.encoder,
        }),
      );
      yield* renderAndRecord(loaded, scope, job, stamp);
    }, Effect.provide(renderLayer)),
  ).pipe(
    Command.withDescription(
      "Render a film, an act or scenes to its project folder, out/<film>/<address>/<variant>.mp4 (+ .vtt captions), stills, or a contact sheet; or one of its shorts (--short); each recorded in the folder's catalogue.json",
    ),
  );

const lookbook = <E, R>(lookLayer: Layer.Layer<Renderer | Looker, E, R>) =>
  Command.make(
    'lookbook',
    {
      film,
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(false),
        Flag.withDescription('burn the captions into the stills (off: the look, not the words)'),
      ),
      variant: variantFlag,
    },
    Effect.fn('film.lookbook')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      const whole = yield* scopeOf(loaded, placed, {
        act: Option.none(),
        scene: Option.none(),
        short: Option.none(),
      });
      const stamp = stampOf(yield* (yield* Stamps).scenes(loaded, placed), whole);
      yield* renderAndRecord(
        loaded,
        whole,
        RenderJob.LookBook({
          address: whole.address,
          variant: input.variant,
          captions: input.captions,
        }),
        stamp,
      );
      const looked = yield* (yield* Looker).look(loaded, DRAW_WORKERS, whole);
      for (const line of lookLines(looked.looks, whole.acts)) yield* Console.log(line);
    }, Effect.provide(lookLayer)),
  ).pipe(
    Command.withDescription(
      "Write out/<film>/film/<variant>/lookbook.jpg (every scene's stills at its cue edges and 60% point, labelled, with the palette) and print each scene's and act's light, held share and largest face",
    ),
  );

const chaptersCommand = Command.make(
  'chapters',
  { film },
  Effect.fn('film.chapters')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const lines = yield* Effect.fromResult(filmChapters(loaded, yield* placeFilm(loaded)));
    for (const line of lines) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "Print the film's YouTube chapters, one `mm:ss title` line each, from the acts its film.ts look names",
  ),
);

/**
 * A server built in the command's scope, its URL printed (the line a reader
 * opens) and its ready event logged, then held until Ctrl-C (or the unit
 * stops): the scope then stops the server and its handler.
 */
const serveUntilInterrupted = <E>(
  server: Layer.Layer<PreviewServer, E>,
  lines: (server: PreviewServerService) => readonly [printed: string, ready: string],
) =>
  Effect.gen(function* () {
    const [printed, ready] = lines(Context.get(yield* Layer.build(server), PreviewServer));
    yield* Console.log(printed);
    yield* Effect.log(ready);
    return yield* Effect.never;
  });

const lab = <E>(labServer: LabServer<E>) =>
  Command.make(
    'lab',
    { film },
    Effect.fn('film.lab')(function* (input) {
      // An unknown film fails here, before a server starts.
      yield* (yield* FilmRepo).load(input.film);
      // The lab's whole API: notes, scene source, steps and the studio.
      const handler = yield* labHandler(input.film);
      const notes = (yield* NotesStore).paths(input.film).notes.file;
      return yield* serveUntilInterrupted(labServer(handler), (server) => {
        const url = `${server.url}lab?film=${encodeURIComponent(input.film)}`;
        return [url, `lab.ready film=${input.film} url=${url} notes=${notes}`];
      });
    }, Effect.scoped),
  ).pipe(
    Command.withDescription(
      'Open the film lab: the player in dev mode with notes on frames, and cues and knobs that write back to the scene files (Ctrl-C stops it)',
    ),
  );

const review = <E>(reviewServer: LabServer<E>, reviewPage: Effect.Effect<LabHandler, E>) =>
  Command.make(
    'review',
    {},
    Effect.fn('film.review')(function* () {
      const handler = yield* reviewHandler(yield* reviewAllowed, yield* reviewPage);
      const roots = (yield* Review).roots.map((root) => `${root.label}=${root.path}`);
      return yield* serveUntilInterrupted(reviewServer(handler), (server) => [
        server.url,
        `review.ready url=${server.url} roots=${roots.join(',')}`,
      ]);
    }, Effect.scoped),
  ).pipe(
    Command.withDescription(
      "Serve the review: every render under the review roots, compared in sync, and each film's options to pick from (Ctrl-C stops it)",
    ),
  );

const Platform = BunServices.layer;
const Store = ContentStore.layer.pipe(Layer.provide(Platform));
const Tools = Layer.mergeAll(ElevenLabs.layer, Media.layer).pipe(Layer.provide(Platform));

/** What the app hands the CLI: where its films are, and the servers for its player page. */
export interface FilmApp<E> {
  /** The films folder (`<film>/scenes`, `<film>/narration`, ...), the one the player imports. */
  readonly films: string;
  /** The app's sound library folder (`library.ts`, its lock, `files/`, `public/`), shared by its films. */
  readonly sounds: string;
  /** The player, served while `render` or `check` runs. */
  readonly previewServer: Layer.Layer<PreviewServer, E>;
  /** The player in development mode with the lab's routes, served while `lab` runs. */
  readonly labServer: LabServer<E>;
  /**
   * The review, served while `review` runs: its server (on the host and port
   * the app chooses, answering every request with the handler it is given),
   * its page (made when `review` starts: a handler for the page, its assets
   * and what else the app serves, asked only once the review admits the
   * request), and the roots it reads when `FILM_REVIEW_ROOTS` names none.
   */
  readonly review: {
    readonly server: LabServer<E>;
    readonly page: Effect.Effect<LabHandler, E>;
    readonly roots: Effect.Effect<
      ReadonlyArray<ReviewRoot>,
      never,
      FileSystem.FileSystem | Path.Path
    >;
  };
  /**
   * The command that runs this CLI (e.g. `['bun', '/app/cli.ts']`): the lab
   * runs `check --static` through it in a fresh process after each write, so
   * the check reads the scene files as the write left them, and the review
   * reads a film's options, keeps its takes and makes their mixes through it
   * (`options`, `FreshFilm`).
   */
  readonly self: ReadonlyArray<string>;
}

/**
 * Run the `film` CLI over the app's films, with its player servers. The
 * server and the browser start only for `render` and the layout leg of
 * `check`, and stop with them; the lab server runs while `lab` does.
 */
export const runFilmCli = <E>({
  films,
  sounds,
  previewServer,
  labServer,
  review: reviewApp,
  self,
}: FilmApp<E>): void => {
  const Repo = FilmRepo.layer(films, Option.some(sounds)).pipe(Layer.provide([Store, Platform]));
  const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
  const Source = Layer.mergeAll(SceneWriter.layer, SceneHead.layer, Stamps.layer).pipe(
    Layer.provideMerge(SourceWriter.layer),
    Layer.provideMerge(SceneSources.layer),
    Layer.provide([Repo, Store, Platform]),
  );
  // Each film's project folder: its renders, and the owner's approvals and comments on them.
  const Catalogue = RenderCatalogue.layer.pipe(Layer.provide(Platform));
  // The lab checks each write, and the review reads a film's options, keeps its takes and
  // makes its mixes, through this CLI in a fresh process.
  const Fresh = FreshFilm.layer(self).pipe(Layer.provide(Platform));
  const Private = PrivateStore.layer(sounds).pipe(Layer.provide([FetchHttpClient.layer, Platform]));
  const Library = SoundLibrary.layer(sounds).pipe(Layer.provide([Store, Tools, Private, Platform]));
  const Reviewed = Review.layerConfig(reviewApp.roots).pipe(
    Layer.provideMerge(BunHttpPlatform.layer),
    // Its lengths, frames and phone copies are the Media service's.
    Layer.provide([Tools, Platform]),
  );
  const Services = Layer.mergeAll(Choices.layer, StudioReadings.layer).pipe(
    // The review hears each option in the mix, and writes a pick through the source writer;
    // the lab's studio reads the film's script and voice fresh.
    Layer.provideMerge(
      Layer.mergeAll(Narrator.layer, Takes.layer, Composer.layer, Mixer.layer).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            Repo,
            Notes,
            Source,
            Library,
            Private,
            Store,
            Tools,
            Reviewed,
            Catalogue,
            Fresh,
            Platform,
          ),
        ),
      ),
    ),
  );
  const renderLayer = Renderer.layer.pipe(Layer.provide([Browser.layer, previewServer]));
  const checkLayer = Layer.mergeAll(Checker.layer, Looker.layer).pipe(
    Layer.provide([Browser.layer, previewServer]),
  );
  const lookLayer = Layer.mergeAll(Renderer.layer, Looker.layer).pipe(
    Layer.provide([Browser.layer, previewServer]),
  );
  const root = Command.make('film').pipe(
    Command.withDescription('Narrate, score, mix, inspect and render a cut-paper film'),
    Command.withSubcommands([
      narrate,
      takes,
      script,
      score,
      sfx,
      media,
      mix,
      options,
      read,
      cues(checkLayer),
      check(checkLayer),
      render(renderLayer),
      project(renderLayer),
      lookbook(lookLayer),
      chaptersCommand,
      doctor(previewServer),
      lab(labServer),
      review(reviewApp.server, reviewApp.page),
      notes,
    ]),
  );
  // Logs go to stderr, so stdout carries only what a command prints: the lines
  // `cues`, `check` and `notes --watch` hand to a reader or a Monitor.
  const Logs = Layer.succeed(Logger.LogToStderr, true);
  // A bare `--accept-mismatch` stays bare: the parser would take the next word as its beats.
  // A take heard as something else is printed with the flags that re-record or keep it.
  Stdio.Stdio.use(({ args }) =>
    Effect.flatMap(args, (given) =>
      Command.runWith(root, { version: '0.1.0' })(bareAcceptMismatch(given)).pipe(
        Effect.mapError(atTheCommandLine),
      ),
    ),
  ).pipe(
    // runMain would report a failure after these layers are gone, through the
    // default logger, onto stdout; it is reported here instead, under `Logs`.
    Effect.tapCause(reportFailure),
    Effect.provide(Layer.mergeAll(Services, Logs)),
    BunRuntime.runMain({ disableErrorReporting: true }),
  );
};

/**
 * A failure as the CLI reports it: a typed error by its tag and message only
 * (its stack is where Schema built the error, not where the run went wrong);
 * a defect, or anything but an Error, as the whole cause, stack included.
 */
const reportOf = (cause: Cause.Cause<unknown>): unknown =>
  Option.match(
    Option.filter(
      Cause.findErrorOption(cause),
      (error) => !Cause.hasDies(cause) && Predicate.isError(error),
    ),
    {
      onNone: () => cause,
      onSome: (error) => String(error),
    },
  );

/** What runMain reports of a failure (not an interrupt, nor an error marked unreported), as an error log. */
const reportFailure = (cause: Cause.Cause<unknown>) =>
  Effect.when(
    Effect.logError(reportOf(cause)),
    Effect.sync(
      () => !Cause.hasInterruptsOnly(cause) && Runtime.getErrorReported(Cause.squash(cause)),
    ),
  );
