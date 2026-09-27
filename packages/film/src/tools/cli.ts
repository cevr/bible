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
//   film lab <film>
//   film notes <film> [--watch] [--since n]
//   film notes reply <film> <id> <text> [--still file.png]
//   film notes resolve <film> <id>
//   film render <film> [--stills t,t | --contact secs] [--scene id,id | --from s --to s]
//                      [--workers n] [--scale k] [--no-captions] [--tag name] [--out file]
//                      [--no-share]
//   film lookbook <film> [--captions] [--tag name]
//   film bench <film> [--every n] [--runs n] [--scene id,id] [--hash] [--baseline] [--budget]
//   film bench <film> --workers n,n [--scene id,id | --from s --to s] [--runs n] [--no-share]
//
// narrate and score finish with a mix, so the track is always rebuilt from the
// same inputs; mix alone never calls a paid API.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Array as Arr,
  Console,
  Context,
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
import { Bencher } from './bencher.ts';
import { Browser, browserReady } from './browser.ts';
import { type Reported, staticFindings } from './check.ts';
import { Checker } from './checker.ts';
import { Composer } from './composer.ts';
import { ContentStore, type StoreError } from './content-store.ts';
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
import { FilmRepo, type LoadedFilm, placeFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { Mixer, masterFile, measureMaster } from './mixer.ts';
import { Narrator, planNarration } from './narrator.ts';
import { labHandler } from './lab.ts';
import { NotesStore } from './notes-store.ts';
import { cursorLine, noteLine, replyLine, watchLine } from './notes-lines.ts';
import { type LabServer, PreviewServer } from './preview-server.ts';
import { RenderJob, sceneSpan } from './render-plan.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { StaticCheck } from './static-check.ts';
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

/** What a paid run needs before it spends a credit: a logged-in CLI. The remix after it runs in-process. */
const paidPreflight = Effect.gen(function* () {
  yield* (yield* ElevenLabs).ready;
});

interface ToolCheck {
  readonly tool: string;
  /** The commands that need it. */
  readonly needed: string;
  readonly run: Effect.Effect<void, BrowserMissing | BrowserFailed | ElevenLabsFailed, Path.Path>;
}

const doctor = Command.make(
  'doctor',
  {},
  Effect.fn('film.doctor')(function* () {
    const elevenLabs = yield* ElevenLabs;
    const checks: ReadonlyArray<ToolCheck> = [
      { tool: 'chromium', needed: 'render, check', run: browserReady },
      { tool: 'elevenlabs', needed: 'narrate, score', run: elevenLabs.ready },
    ];
    const results = yield* Effect.forEach(checks, (c) => Effect.result(c.run), {
      concurrency: checks.length,
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
    'Check the tools the film commands need: headless Chromium, and the elevenlabs CLI and its login',
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
        yield* Media,
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
      'Render a film to out/<film>.mp4 (+ .vtt captions), stills, or a contact sheet',
    ),
  );

const lookbook = <E, R>(renderLayer: Layer.Layer<Renderer, E, R>) =>
  Command.make(
    'lookbook',
    {
      film,
      captions: Flag.Boolean('captions').pipe(
        Flag.withDefault(false),
        Flag.withDescription('burn the captions into the stills (off: the look, not the words)'),
      ),
      tag: Flag.String('tag').pipe(
        Flag.withDefault(''),
        Flag.withDescription('output subfolder under out/<film> (default: out/<film> itself)'),
      ),
    },
    Effect.fn('film.lookbook')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      yield* (yield* Renderer).render(
        loaded,
        RenderJob.LookBook({ tag: input.tag, captions: input.captions, workers: 1 }),
      );
    }, Effect.provide(renderLayer)),
  ).pipe(
    Command.withDescription(
      "Write out/<film>/lookbook.jpg: every scene's stills at its cue edges and 60% point, labelled, with the palette",
    ),
  );

/** `--workers 2,4,6`: page counts, each a whole number from 1. */
const WorkerCounts = Schema.Array(
  Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
);

const bench = <E, R>(benchLayer: Layer.Layer<Bencher, E, R>) =>
  Command.make(
    'bench',
    {
      film,
      every: Flag.Int('every').pipe(
        Flag.withDefault(10),
        Flag.withDescription('time every this many frames'),
      ),
      runs: Flag.Int('runs').pipe(
        Flag.withDefault(3),
        Flag.withDescription(
          'time each frame (or render each count) this many times; the median counts',
        ),
      ),
      scene: scenes.pipe(Flag.withDescription('only these scenes (id,id)')),
      hash: Flag.Boolean('hash').pipe(
        Flag.withDefault(false),
        Flag.withDescription('also hash every 30th frame, to compare pixels with the baseline'),
      ),
      baseline: Flag.Boolean('baseline').pipe(
        Flag.withDefault(false),
        Flag.withDescription('keep this run as out/<film>/bench.baseline.json'),
      ),
      budget: Flag.Boolean('budget').pipe(
        Flag.withDefault(false),
        Flag.withDescription(
          'fail when a scene or the film draws over 10% slower than the baseline on this machine, or a hashed frame moved',
        ),
      ),
      workers: Flag.String('workers').pipe(
        Flag.optional,
        Flag.withDescription(
          'instead: render the range (--scene, or --from/--to) at each of these page counts (n,n) and report the median fps',
        ),
      ),
      from: Flag.Finite('from').pipe(
        Flag.optional,
        Flag.withDescription('with --workers: start, in seconds'),
      ),
      to: Flag.Finite('to').pipe(
        Flag.optional,
        Flag.withDescription('with --workers: end, in seconds'),
      ),
      share: Flag.Boolean('share').pipe(
        Flag.withDefault(true),
        Flag.withDescription('with --workers: encode the share copy too, as a render does'),
      ),
    },
    Effect.fn('film.bench')(function* (input) {
      const loaded = yield* (yield* FilmRepo).load(input.film);
      const placed = yield* placeFilm(loaded);
      const bencher = yield* Bencher;
      const picked = yield* Option.match(input.scene, {
        onNone: () => Effect.succeedNone,
        onSome: (ids) => Effect.map(Effect.fromResult(scenesOf(placed, ids)), Option.some),
      });
      if (Option.isSome(input.workers)) {
        const counts = yield* Schema.decodeEffect(WorkerCounts)(input.workers.value.split(','));
        const span = Option.map(picked, (hit) => ({
          from: Math.min(...hit.map((p) => p.start)),
          to: Math.max(...hit.map((p) => p.start + p.dur)),
        }));
        yield* bencher.workers(loaded, {
          workers: counts,
          runs: input.runs,
          share: input.share,
          from: Option.orElse(
            Option.map(span, (s) => s.from),
            () => input.from,
          ),
          to: Option.orElse(
            Option.map(span, (s) => s.to),
            () => input.to,
          ),
        });
        return;
      }
      yield* bencher.draw(loaded, {
        every: Math.max(1, input.every),
        runs: Math.max(1, input.runs),
        scenes: Option.map(picked, (hit) => new Set(hit.map((p) => p.spec.id))),
        hash: input.hash,
        baseline: input.baseline,
        budget: input.budget,
      });
    }, Effect.provide(benchLayer)),
  ).pipe(
    Command.withDescription(
      'Time a film on the render path: ms of draw per frame per scene (out/<film>/bench.json, a 10% budget against --baseline with --budget), or render fps per worker count (--workers)',
    ),
  );

const lab = <E>(labServer: LabServer<E>) =>
  Command.make(
    'lab',
    { film },
    Effect.fn('film.lab')(function* (input) {
      // An unknown film fails here, before a server starts.
      yield* (yield* FilmRepo).load(input.film);
      const handler = yield* labHandler(input.film);
      const server = Context.get(yield* Layer.build(labServer(handler)), PreviewServer);
      const url = `${server.url}?film=${encodeURIComponent(input.film)}&lab`;
      const notes = (yield* NotesStore).paths(input.film).notes.file;
      yield* Console.log(url);
      yield* Effect.log(`lab.ready film=${input.film} url=${url} notes=${notes}`);
      // Until Ctrl-C: the scope then stops the server and the handler.
      return yield* Effect.never;
    }, Effect.scoped),
  ).pipe(
    Command.withDescription(
      'Open the film lab: the player in dev mode with notes on frames, and cues and knobs that write back to the scene files (Ctrl-C stops it)',
    ),
  );

const noteId = Argument.String('id').pipe(Argument.withDescription('the note, e.g. n3'));

const notesReply = Command.make(
  'reply',
  {
    film,
    id: noteId,
    text: Argument.String('text').pipe(Argument.withDescription('the reply')),
    still: Flag.String('still').pipe(
      Flag.optional,
      Flag.withDescription('a PNG to show with the reply: the frame after the change'),
    ),
  },
  Effect.fn('film.notes.reply')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const still = yield* Option.match(input.still, {
      onNone: () => Effect.succeedNone,
      onSome: (file) => Effect.map(fs.readFile(file), Option.some),
    });
    const note = yield* (yield* NotesStore).reply(input.film, input.id, {
      by: 'agent',
      text: input.text,
      still,
    });
    yield* Console.log(noteLine((yield* NotesStore).paths(input.film), note, note.changed));
  }),
).pipe(Command.withDescription("Reply to a note as the agent; it shows in the lab's thread"));

const notesResolve = Command.make(
  'resolve',
  { film, id: noteId },
  Effect.fn('film.notes.resolve')(function* (input) {
    const note = yield* (yield* NotesStore).resolve(input.film, input.id);
    yield* Console.log(noteLine((yield* NotesStore).paths(input.film), note, note.changed));
  }),
).pipe(Command.withDescription('Mark a note resolved'));

/** How long one wait of `--watch` holds before it asks again. */
const WATCH_WAIT = '30 seconds';

const notes = Command.make(
  'notes',
  {
    film,
    watch: Flag.Boolean('watch').pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        'stream each new note, and each reply from the user, as one line, once (for a Monitor); prints `watch since=<seq>` first',
      ),
    ),
    since: Flag.Int('since').pipe(
      Flag.optional,
      Flag.withDescription(
        'with --watch: start past this cursor (from `cursor seq=` of a list, or the last `seq=` a watch printed) instead of the current one',
      ),
    ),
  },
  Effect.fn('film.notes')(function* (input) {
    const store = yield* NotesStore;
    const at = store.paths(input.film);
    const file = yield* store.read(input.film);
    if (!input.watch) {
      const open = file.notes.filter((n) => n.status !== 'resolved');
      for (const note of open) yield* Console.log(noteLine(at, note, note.changed));
      // The cursor this list saw: a watch started past it misses nothing made since.
      yield* Console.log(cursorLine(file.seq));
      yield* Effect.log(`notes.list film=${input.film} open=${open.length} cursor=${file.seq}`);
      return;
    }
    const start = Option.getOrElse(input.since, () => file.seq);
    yield* Console.log(watchLine(start));
    yield* Effect.log(`notes.watch film=${input.film} since=${start}`);
    // Each wait passes the cursor on, so every change prints once.
    const watch = (since: number): Effect.Effect<never, StoreError> =>
      store.wait(input.film, since, WATCH_WAIT).pipe(
        Effect.tap((waited) =>
          Effect.forEach(waited.events, (event) => {
            if (event._tag === 'NoteAdded') return Console.log(noteLine(at, event.note, event.seq));
            if (event._tag === 'NoteReplied' && event.reply.by === 'user')
              return Console.log(replyLine(at, event.note, event.reply));
            return Effect.void;
          }),
        ),
        Effect.flatMap((waited) => watch(waited.cursor)),
      );
    return yield* watch(start);
  }),
).pipe(
  Command.withDescription(
    "List a film's open notes from the lab (id, scene, time, nearest cue, still, text), or --watch for new ones",
  ),
  Command.withSubcommands([notesReply, notesResolve]),
);

const Platform = BunServices.layer;
const Store = ContentStore.layer.pipe(Layer.provide(Platform));
const Tools = Layer.mergeAll(ElevenLabs.layer, Media.layer).pipe(Layer.provide(Platform));

/** What the app hands the CLI: where its films are, and the servers for its player page. */
export interface FilmApp<E> {
  /** The films folder (`<film>/scenes`, `<film>/narration`, ...), the one the player imports. */
  readonly films: string;
  /** The player, served while `render` or `check` runs. */
  readonly previewServer: Layer.Layer<PreviewServer, E>;
  /** The player in development mode with the lab's routes, served while `lab` runs. */
  readonly labServer: LabServer<E>;
  /**
   * The command that runs this CLI (e.g. `['bun', '/app/cli.ts']`): the lab
   * runs `check --static` through it in a fresh process after each write, so
   * the check reads the scene files as the write left them.
   */
  readonly self: ReadonlyArray<string>;
}

/**
 * Run the `film` CLI over the app's films, with its player servers. The
 * server and the browser start only for `render` and the layout leg of
 * `check`, and stop with them; the lab server runs while `lab` does.
 */
export const runFilmCli = <E>({ films, previewServer, labServer, self }: FilmApp<E>): void => {
  const Repo = FilmRepo.layer(films).pipe(Layer.provide([Store, Platform]));
  const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
  const Source = Layer.mergeAll(SceneWriter.layer, SceneHead.layer).pipe(
    Layer.provideMerge(SceneSources.layer),
    Layer.provide([Repo, Store, Platform]),
  );
  const Check = StaticCheck.layer(self).pipe(Layer.provide(Platform));
  const Services = Layer.mergeAll(Narrator.layer, Composer.layer, Mixer.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(Repo, Notes, Source, Check, Store, Tools, Platform)),
  );
  const renderLayer = Renderer.layer.pipe(Layer.provide([Browser.layer, previewServer]));
  const checkLayer = Checker.layer.pipe(Layer.provide([Browser.layer, previewServer]));
  const benchLayer = Bencher.layer.pipe(
    Layer.provide(Renderer.layer),
    Layer.provide([Browser.layer, previewServer]),
  );
  const root = Command.make('film').pipe(
    Command.withDescription('Narrate, score, mix, inspect and render a cut-paper film'),
    Command.withSubcommands([
      narrate,
      score,
      mix,
      cues,
      check(checkLayer),
      render(renderLayer),
      lookbook(renderLayer),
      bench(benchLayer),
      doctor,
      lab(labServer),
      notes,
    ]),
  );
  // Logs go to stderr, so stdout carries only what a command prints: the lines
  // `cues`, `check` and `notes --watch` hand to a reader or a Monitor.
  const Logs = Layer.succeed(Logger.LogToStderr, true);
  Command.run(root, { version: '0.1.0' }).pipe(
    Effect.provide(Layer.mergeAll(Services, Logs)),
    BunRuntime.runMain,
  );
};
