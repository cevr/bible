// `film`: the tools that turn a film's script into sound and pictures, run
// from the app that holds the films. The app owns its entry (`runFilmCli`) and
// names its films folder. The pictures are each film's Rive project, drawn in
// the Rive editor or in RML; `sync` keeps it in step with the script and the
// takes, and moves it to and from the Rive file the editor opens.
//
//   film narrate <film> [--only id,id] [--force] [--dry-run] [--accept-mismatch]
//   film score <film> [--only music|<effect>,...] [--dry-run]
//   film mix <film> [--stems]
//   film sync <film> [--pull] [--push] [--project id] [--name label]
//   film cues <film> [scene] [--sound]
//   film check <film> [--allow-stale] [--scene id,id]
//   film doctor
//   film render <film> [--stills t,t | --contact secs] [--scene id,id | --from s --to s]
//                      [--fps n] [--workers n] [--scale k] [--tag name] [--out file] [--no-share]
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
  Logger,
  Option,
  type Path,
  Result,
  Schema,
} from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { scenesOf } from '../core/layout.ts';
import { eventTimes, filmScenes } from '../core/scenes.ts';
import type { EventTimes } from '../core/sound.ts';
import { Browser, browserReady } from './browser.ts';
import { type Reported, projectFindings, staticFindings } from './check.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { sceneReport, soundReport } from './cues.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type BrowserFailed,
  type BrowserMissing,
  CheckFailed,
  type ElevenLabsFailed,
  type RiveFailed,
  type RiveMissing,
  SoundMissing,
} from './errors.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { masterFile, measureMaster } from './master.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { Narrator, planNarration } from './narrator.ts';
import { PageServer } from './page-server.ts';
import { FilmProject } from './project.ts';
import { RenderJob, sceneSpan } from './render-plan.ts';
import { Renderer } from './renderer.ts';
import { Rive } from './rive.ts';

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

/** What a paid run needs before it spends a credit: a logged-in CLI. The remix after it runs in-process. */
const paidPreflight = Effect.gen(function* () {
  yield* (yield* ElevenLabs).ready;
});

interface ToolCheck {
  readonly tool: string;
  /** The commands that need it. */
  readonly needed: string;
  /** What it found, when it is there. */
  readonly run: Effect.Effect<
    string,
    BrowserMissing | BrowserFailed | ElevenLabsFailed | RiveMissing | RiveFailed,
    Path.Path
  >;
}

const doctor = Command.make(
  'doctor',
  {},
  Effect.fn('film.doctor')(function* () {
    const elevenLabs = yield* ElevenLabs;
    const rive = yield* Rive;
    const riveCheck = Effect.gen(function* () {
      const version = yield* rive.version;
      const who = yield* rive.whoami;
      return Option.match(who, {
        onNone: () => `${version}, signed out: sync --pull/--push need \`rive login\``,
        onSome: (user) => `${version}, signed in as ${user}`,
      });
    });
    const checks: ReadonlyArray<ToolCheck> = [
      { tool: 'chromium', needed: 'render', run: Effect.as(browserReady, '') },
      { tool: 'elevenlabs', needed: 'narrate, score', run: Effect.as(elevenLabs.ready, '') },
      { tool: 'rive', needed: 'sync, check, render', run: riveCheck },
    ];
    const results = yield* Effect.forEach(checks, (c) => Effect.result(c.run), {
      concurrency: checks.length,
    });
    for (const [{ tool, needed }, result] of Arr.zip(checks, results))
      yield* Console.log(
        Result.match(result, {
          onSuccess: (found) =>
            [`ok      ${tool.padEnd(11)} (${needed})`, found].filter((p) => p !== '').join(' '),
          onFailure: (error) => `missing ${tool.padEnd(11)} (${needed}): ${error.message}`,
        }),
      );
    const failure = Arr.head(Arr.getFailures(results));
    if (Option.isSome(failure)) return yield* failure.value;
  }),
).pipe(
  Command.withDescription(
    'Check the tools the film commands need: headless Chromium, the elevenlabs CLI and its login, and the rive CLI',
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
    const plan = yield* Effect.fromResult(planNarration(loaded, options));
    const stale = plan.stale.map((b) => b.id).join(',') || 'none';
    yield* Effect.log(
      `narrate.plan film=${input.film} beats=${plan.beats.length} to_record=${stale}`,
    );
    if (input.dryRun) return;
    // Before the first paid take: the CLI must be logged in.
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
    'Rebuild narration/full.wav, the mixed track, from the current takes and sound',
  ),
);

/** Where each scene's Events play; none before the film's first sync. */
const filmEvents = Effect.fn('film.events')(function* (film: string) {
  const loaded = yield* (yield* FilmRepo).load(film);
  const placed = yield* placeFilm(loaded);
  const events: EventTimes = yield* (yield* FilmProject).events(loaded, placed);
  return { loaded, placed, events };
});

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
    const { loaded, placed, events } = yield* filmEvents(input.film);
    if (input.sound) {
      const sound = yield* Option.match(loaded.sound, {
        onNone: () => Effect.fail(SoundMissing.make({ film: input.film })),
        onSome: Effect.succeed,
      });
      const lines = yield* Effect.fromResult(soundReport(sound, placed, input.scene, events));
      for (const line of lines) yield* Console.log(line);
      return;
    }
    const lines = yield* Effect.fromResult(sceneReport(placed, input.scene, events));
    for (const line of lines) yield* Console.log(line);
  }),
).pipe(
  Command.withDescription(
    "Print each scene's placement, its marks, and where its Events play (film seconds from the scene's start)",
  ),
);

const sync = Command.make(
  'sync',
  {
    film,
    pull: Flag.Boolean('pull').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "first pull what was drawn in the editor over the project (refused while git lacks the project's changes)",
      ),
    ),
    push: Flag.Boolean('push').pipe(
      Flag.withDefault(false),
      Flag.withDescription('then push the project to its Rive file, for the editor'),
    ),
    project: Flag.String('project').pipe(
      Flag.optional,
      Flag.withDescription('the Rive project a first push creates the file in'),
    ),
    name: Flag.String('name').pipe(
      Flag.optional,
      Flag.withDescription("the pushed revision's label"),
    ),
  },
  Effect.fn('film.sync')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const placed = yield* placeFilm(loaded);
    const synced = yield* (yield* FilmProject).sync(loaded, placed, {
      pull: input.pull,
      push: input.push || Option.isSome(input.project),
      project: input.project,
      name: input.name,
    });
    for (const beat of synced.seeded) yield* Console.log(`seeded     ${beat}`);
    for (const pins of synced.pins) {
      for (const mark of pins.unpinned) yield* Console.log(`unpinned   ${pins.scene} {${mark}}`);
      for (const mark of pins.disordered) yield* Console.log(`disordered ${pins.scene} {${mark}}`);
    }
    for (const board of synced.extra) yield* Console.log(`extra      ${board}`);
    yield* Effect.log(
      `sync.done film=${input.film} seeded=${synced.seeded.length} soundtrack=${synced.soundtrack} riv=${synced.built.riv} bytes=${synced.built.bytes}`,
    );
  }),
).pipe(
  Command.withDescription(
    "Keep the film's Rive project in step: seed a storyboard for each undrawn beat, write the Film and its soundtrack, build; --pull and --push move it to and from the editor",
  ),
);

const check = Command.make(
  'check',
  {
    film,
    allowStale: Flag.Boolean('allow-stale').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'report stale takes, sounds, audio master and Film as warnings, not errors',
      ),
    ),
    scene: scenes.pipe(Flag.withDescription("check just these beats' scenes (id,id)")),
  },
  Effect.fn('film.check')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    const placed = yield* placeFilm(loaded);
    // A misspelt scene fails here, before the project is read.
    const only = yield* Option.match(input.scene, {
      onNone: () => Effect.succeed(Option.none<ReadonlySet<string>>()),
      onSome: (ids) =>
        Effect.fromResult(scenesOf(placed, ids)).pipe(
          Effect.map((picked) => Option.some(new Set(picked.map((p) => p.spec.id)))),
        ),
    });
    const project = yield* (yield* FilmProject).state(loaded, placed);
    const events: EventTimes = Option.match(project, {
      onNone: () => new Map(),
      onSome: (state) => eventTimes(filmScenes(placed, state.doc).scenes),
    });
    const master = yield* measureMaster(
      yield* FileSystem.FileSystem,
      yield* Media,
      masterFile(loaded.paths),
    );
    const options = { allowStale: input.allowStale };
    const found: ReadonlyArray<Reported> = [
      ...staticFindings(loaded, placed, options, master, events),
      ...projectFindings(loaded, placed, project, only, options),
    ];
    for (const { level, finding } of found)
      yield* Console.log(`${level.padEnd(7)} ${finding._tag.padEnd(17)} ${finding.message}`);
    const errors = found.filter((r) => r.level === 'error').length;
    const warnings = found.length - errors;
    yield* Effect.log(`check.done film=${input.film} errors=${errors} warnings=${warnings}`);
    if (errors > 0) return yield* CheckFailed.make({ errors, warnings });
  }),
).pipe(
  Command.withDescription(
    'Check a film: current takes and sounds, sound cues that resolve, an audio master as long as the film, and its Rive project: every beat drawn, every mark on an Event, the Film current',
  ),
);

/** `--stills 3,10.5`: seconds, each a finite number. */
const Seconds = Schema.Array(Schema.FiniteFromString);

/** The browser and the page server start only when `render` runs, and stop with it. */
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
      fps: Flag.Int('fps').pipe(Flag.withDefault(30), Flag.withDescription('frames per second')),
      workers: Flag.Int('workers').pipe(
        Flag.withDefault(4),
        Flag.withDescription('pages rendering at once'),
      ),
      scale: Flag.Finite('scale').pipe(
        Flag.withDefault(1),
        Flag.withDescription('scale the video, e.g. 0.5'),
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
      share: Flag.Boolean('share').pipe(
        Flag.withDefault(true),
        Flag.withDescription(
          'also write a smaller copy to send, <out>.share.mp4 (--no-share to skip it)',
        ),
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
      const base = { tag: input.tag, fps: input.fps, workers: Math.max(1, input.workers) };
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
                RenderJob.Video({
                  ...base,
                  from,
                  to,
                  scale: input.scale,
                  out: input.out,
                  share: input.share,
                }),
            }),
          ),
      });
      yield* (yield* Renderer).render(loaded, job);
    }, Effect.provide(renderLayer)),
  ).pipe(
    Command.withDescription(
      "Render a film's Rive project to out/<film>.mp4 (+ .vtt captions), stills, or a contact sheet",
    ),
  );

const Platform = BunServices.layer;
const Store = ContentStore.layer.pipe(Layer.provide(Platform));
const Tools = Layer.mergeAll(ElevenLabs.layer, Media.layer, Rive.layer).pipe(
  Layer.provide(Platform),
);

/** What the app hands the CLI. */
export interface FilmApp {
  /** The films folder: `<film>/script.ts`, `<film>/narration`, `<film>/rive`, ... */
  readonly films: string;
}

/**
 * Run the `film` CLI over the app's films. The page server and the browser
 * start only for `render`, and stop with it.
 */
export const runFilmCli = ({ films }: FilmApp): void => {
  const Repo = FilmRepo.layer(films).pipe(Layer.provide([Store, Platform]));
  const Project = FilmProject.layer.pipe(Layer.provide([Tools, Platform]));
  const Services = Layer.mergeAll(Narrator.layer, Composer.layer, Mixer.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(Repo, Project, Store, Tools, Platform)),
  );
  const Render = Renderer.layer.pipe(
    Layer.provide([Browser.layer, PageServer.layer, Project, Tools, Platform]),
  );
  const root = Command.make('film').pipe(
    Command.withDescription('Narrate, score, mix, sync, check and render a film drawn in Rive'),
    Command.withSubcommands([narrate, score, mix, sync, cues, check, render(Render), doctor]),
  );
  // Logs go to stderr, so stdout carries only what a command prints: the lines
  // `cues`, `sync` and `check` hand to a reader.
  const Logs = Layer.succeed(Logger.LogToStderr, true);
  Command.run(root, { version: '0.1.0' }).pipe(
    Effect.provide(Layer.mergeAll(Services, Logs)),
    BunRuntime.runMain,
  );
};
