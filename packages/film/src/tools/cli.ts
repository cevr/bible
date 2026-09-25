// `film`: the tools that turn a film's script into sound and pictures, run
// from the app that holds the films. The app owns its entry (`runFilmCli`): it
// names its films folder and serves its player page, which imports the same
// folder, so the tools and the page always read one film.
//
//   film narrate <film> [--only id,id] [--force] [--dry-run] [--accept-mismatch]
//   film score <film> [--only music|<effect>,...] [--dry-run]
//   film mix <film> [--stems]
//   film cues <film> [scene] [--sound]
//   film check <film> [--static] [--allow-stale] [--scene id,id] [--workers n]
//   film doctor
//   film render <film> [--stills t,t | --contact secs] [--scene id,id | --from s --to s]
//                      [--workers n] [--scale k] [--no-captions] [--tag name] [--out file]
//
// narrate and score finish with a mix, so the track is always rebuilt from the
// same inputs; mix alone never calls a paid API.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Layer,
  Option,
  type Path,
  Result,
  Schema,
} from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { scenesOf } from '../core/layout.ts';
import { Browser, browserReady } from './browser.ts';
import { type Reported, staticFindings } from './check.ts';
import { Checker } from './checker.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { sceneReport, soundReport } from './cues.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type BrowserFailed,
  type BrowserMissing,
  CheckFailed,
  CuesLate,
  type ElevenLabsFailed,
  SoundMissing,
} from './errors.ts';
import { Ffmpeg, type FfmpegError } from './ffmpeg.ts';
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { Mixer, masterFile, measureMaster } from './mixer.ts';
import { Narrator, planNarration } from './narrator.ts';
import type { PreviewServer } from './preview-server.ts';
import { RenderJob, sceneSpan } from './render-plan.ts';
import { Renderer } from './renderer.ts';

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
const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDefault(false),
  Flag.withDescription('print what would be generated, then stop'),
);

/** What a paid run needs before it spends a credit: ffmpeg for the remix and a logged-in CLI. */
const paidPreflight = Effect.gen(function* () {
  const ffmpeg = yield* Ffmpeg;
  const elevenLabs = yield* ElevenLabs;
  yield* Effect.all([ffmpeg.version, elevenLabs.ready], { concurrency: 2, discard: true });
});

interface ToolCheck {
  readonly tool: string;
  /** The commands that need it. */
  readonly needed: string;
  readonly run: Effect.Effect<
    void,
    FfmpegError | BrowserMissing | BrowserFailed | ElevenLabsFailed,
    Path.Path
  >;
}

const doctor = Command.make(
  'doctor',
  {},
  Effect.fn('film.doctor')(function* () {
    const ffmpeg = yield* Ffmpeg;
    const elevenLabs = yield* ElevenLabs;
    const checks: ReadonlyArray<ToolCheck> = [
      { tool: 'ffmpeg', needed: 'mix, render', run: ffmpeg.version },
      { tool: 'chromium', needed: 'render, check', run: browserReady },
      { tool: 'elevenlabs', needed: 'narrate, score', run: elevenLabs.ready },
    ];
    const results = yield* Effect.forEach(checks, (c) => Effect.result(c.run), {
      concurrency: 3,
    });
    for (const [{ tool, needed }, result] of Arr.zip(checks, results))
      yield* Console.log(
        Result.match(result, {
          onSuccess: () => `ok      ${tool.padEnd(11)} (${needed})`,
          onFailure: (error) => `missing ${tool.padEnd(11)} (${needed}): ${error.message}`,
        }),
      );
    const failure = Arr.head(Arr.getFailures(results));
    if (Option.isSome(failure)) return yield* failure.value;
  }),
).pipe(
  Command.withDescription(
    'Check the tools the film commands need: ffmpeg, headless Chromium, and the elevenlabs CLI and its login',
  ),
);

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
    acceptMismatch: Flag.Boolean('accept-mismatch').pipe(
      Flag.withDefault(false),
      Flag.withDescription('keep a take whose transcript does not match its script'),
    ),
  },
  Effect.fn('film.narrate')(function* (input) {
    const repo = yield* FilmRepo;
    const narrator = yield* Narrator;
    const loaded = yield* repo.load(input.film);
    const options = { only: input.only, force: input.force, acceptMismatch: input.acceptMismatch };
    const plan = planNarration(loaded, options);
    const stale = plan.stale.map((b) => b.id).join(',') || 'none';
    yield* Effect.log(
      `narrate.plan film=${input.film} beats=${plan.beats.length} to_record=${stale}`,
    );
    if (input.dryRun) return;
    // Before the first paid take: ffprobe measures each take, and the CLI must be logged in.
    yield* paidPreflight;
    yield* narrator.record(loaded, plan, options);
    yield* (yield* Mixer).mix(input.film, { stems: false });
  }),
).pipe(Command.withDescription("Record a film's stale narration takes, then remix"));

const score = Command.make(
  'score',
  {
    film,
    only: only.pipe(Flag.withDescription('regenerate just these: music, or effect ids')),
    dryRun,
  },
  Effect.fn('film.score')(function* (input) {
    const repo = yield* FilmRepo;
    const composer = yield* Composer;
    const loaded = yield* repo.load(input.film);
    if (!input.dryRun) yield* paidPreflight;
    yield* composer.score(loaded, { only: input.only, dryRun: input.dryRun });
    if (input.dryRun) return;
    yield* (yield* Mixer).mix(input.film, { stems: false });
  }),
).pipe(Command.withDescription("Generate a film's stale music and effects, then remix"));

const mix = Command.make(
  'mix',
  {
    film,
    stems: Flag.Boolean('stems').pipe(
      Flag.withDefault(false),
      Flag.withDescription('also write voice, music and effects stems to out/<film>/stems'),
    ),
  },
  Effect.fn('film.mix')(function* (input) {
    yield* (yield* Mixer).mix(input.film, { stems: input.stems });
  }),
).pipe(
  Command.withDescription(
    'Rebuild narration/full.mp3 and its lossless master full.wav from the current takes and sound',
  ),
);

const cues = Command.make(
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
  },
  Effect.fn('film.cues')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const placed = yield* placeFilm(loaded);
    if (input.sound) {
      const sound = yield* Option.match(loaded.sound, {
        onNone: () => Effect.fail(SoundMissing.make({ film: input.film })),
        onSome: Effect.succeed,
      });
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

const check = <E, R>(checkLayer: Layer.Layer<Checker, E, R>) => {
  /** The browser leg: the server and the browser start only when it runs. */
  const layoutLeg = Effect.fn('film.check.layout')(function* (
    loaded: LoadedFilm,
    workers: number,
    scenes: Option.Option<ReadonlySet<string>>,
  ) {
    return yield* (yield* Checker).layout(loaded, { workers, scenes });
  }, Effect.provide(checkLayer));
  return Command.make(
    'check',
    {
      film,
      static: Flag.Boolean('static').pipe(
        Flag.withDefault(false),
        Flag.withDescription('skip the layout leg: no browser, only cues, takes and sound'),
      ),
      allowStale: Flag.Boolean('allow-stale').pipe(
        Flag.withDefault(false),
        Flag.withDescription('report stale takes, sounds and audio master as warnings, not errors'),
      ),
      scene: scenes.pipe(Flag.withDescription('probe the layout of just these scenes (id,id)')),
      workers: Flag.Int('workers').pipe(
        Flag.withDefault(4),
        Flag.withDescription('pages probing at once'),
      ),
    },
    Effect.fn('film.check')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      // A misspelt scene fails here, in either leg, rather than probing nothing.
      const only = yield* Option.match(input.scene, {
        onNone: () => Effect.succeed(Option.none<ReadonlySet<string>>()),
        onSome: (ids) =>
          Effect.fromResult(scenesOf(placed, ids)).pipe(
            Effect.map((picked) => Option.some(new Set(picked.map((p) => p.spec.id)))),
          ),
      });
      const master = yield* measureMaster(
        yield* FileSystem.FileSystem,
        yield* Ffmpeg,
        masterFile(loaded.paths),
      );
      const found: Array<Reported> = [
        ...staticFindings(loaded, placed, { allowStale: input.allowStale }, master),
      ];
      if (!input.static) {
        const layout = yield* layoutLeg(loaded, input.workers, only);
        for (const finding of layout) found.push({ level: 'error', finding });
      }
      for (const { level, finding } of found)
        yield* Console.log(`${level.padEnd(7)} ${finding._tag.padEnd(12)} ${finding.message}`);
      const errors = found.filter((r) => r.level === 'error').length;
      const warnings = found.length - errors;
      yield* Effect.log(
        `check.done film=${input.film} layout=${!input.static} errors=${errors} warnings=${warnings}`,
      );
      if (errors > 0) return yield* CheckFailed.make({ errors, warnings });
    }),
  ).pipe(
    Command.withDescription(
      'Check a film: cues inside their scenes, sound cues that resolve, current takes and sounds, and no text over text or off the frame at any mark or cue',
    ),
  );
};

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
      from: Flag.Finite('from').pipe(Flag.optional, Flag.withDescription('start, in seconds')),
      to: Flag.Finite('to').pipe(Flag.optional, Flag.withDescription('end, in seconds')),
      workers: Flag.Int('workers').pipe(
        Flag.withDefault(4),
        Flag.withDescription('pages rendering at once'),
      ),
      scale: Flag.Finite('scale').pipe(
        Flag.withDefault(1),
        Flag.withDescription('scale the video, e.g. 0.5'),
      ),
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(true),
        Flag.withDescription('burn the captions in (--no-captions to leave them out)'),
      ),
      tag: Flag.String('tag').pipe(
        Flag.withDefault(''),
        Flag.withDescription(
          'output subfolder under out/<film>, so parallel renders do not collide',
        ),
      ),
      out: Flag.String('out').pipe(
        Flag.optional,
        Flag.withDescription('the video file (default out/<film>.mp4)'),
      ),
    },
    Effect.fn('film.render')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      // `--scene` sets the range from the film's own layout.
      const { from, to } = yield* Option.match(input.scene, {
        onNone: () => Effect.succeed({ from: input.from, to: input.to }),
        onSome: (ids) =>
          placeFilm(loaded).pipe(
            Effect.flatMap((placed) => Effect.fromResult(sceneSpan(placed, ids))),
            Effect.map((span) => ({ from: Option.some(span.from), to: Option.some(span.to) })),
          ),
      });
      const base = {
        tag: input.tag,
        captions: input.captions,
        workers: Math.max(1, input.workers),
      };
      const job = yield* Option.match(input.stills, {
        onSome: (list) =>
          Schema.decodeEffect(Seconds)(list.split(',')).pipe(
            Effect.map((times) => RenderJob.Stills({ ...base, times })),
          ),
        onNone: () =>
          Effect.succeed(
            Option.match(input.contact, {
              onSome: (every) => RenderJob.Contact({ ...base, every, from, to }),
              onNone: () =>
                RenderJob.Video({ ...base, from, to, scale: input.scale, out: input.out }),
            }),
          ),
      });
      yield* (yield* Renderer).render(loaded, job);
    }, Effect.provide(renderLayer)),
  ).pipe(
    Command.withDescription(
      'Render a film to out/<film>.mp4 (+ .vtt captions), stills, or a contact sheet',
    ),
  );

const Platform = BunServices.layer;
const Store = ContentStore.layer.pipe(Layer.provide(Platform));
const Tools = Layer.mergeAll(Ffmpeg.layer, ElevenLabs.layer).pipe(Layer.provide(Platform));

/** What the app hands the CLI: where its films are, and the server for its player page. */
export interface FilmApp<E> {
  /** The films folder (`<film>/scenes`, `<film>/narration`, ...), the one the player imports. */
  readonly films: string;
  readonly previewServer: Layer.Layer<PreviewServer, E>;
}

/**
 * Run the `film` CLI over the app's films, with its player server. The server
 * and the browser start only for `render` and the layout leg of `check`, and
 * stop with them.
 */
export const runFilmCli = <E>({ films, previewServer }: FilmApp<E>): void => {
  const Repo = FilmRepo.layer(films).pipe(Layer.provide([Store, Platform]));
  const Services = Layer.mergeAll(Narrator.layer, Composer.layer, Mixer.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(Repo, Store, Tools, Platform)),
  );
  const renderLayer = Renderer.layer.pipe(Layer.provide([Browser.layer, previewServer]));
  const checkLayer = Checker.layer.pipe(Layer.provide([Browser.layer, previewServer]));
  const root = Command.make('film').pipe(
    Command.withDescription('Narrate, score, mix, inspect and render a cut-paper film'),
    Command.withSubcommands([
      narrate,
      score,
      mix,
      cues,
      check(checkLayer),
      render(renderLayer),
      doctor,
    ]),
  );
  Command.run(root, { version: '0.1.0' }).pipe(Effect.provide(Services), BunRuntime.runMain);
};
