#!/usr/bin/env bun
// `film`: the tools that turn a film's script into sound, run from the app
// that holds the films (`src/films/<film>`, or FILMS_DIR).
//
//   film narrate <film> [--only id,id] [--force] [--dry-run] [--accept-mismatch]
//   film score <film> [--only music|<effect>,...] [--dry-run]
//   film mix <film> [--stems]
//   film cues <film> [scene] [--sound]
//
// narrate and score finish with a mix, so the track is always rebuilt from the
// same inputs; mix alone never calls a paid API.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { sceneReport, soundReport } from './cues.ts';
import { ElevenLabs } from './elevenlabs.ts';
import { CuesLate, SoundMissing } from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { Mixer } from './mixer.ts';
import { Narrator, planNarration } from './narrator.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/** `--only a,b` as a set of ids. */
const only = Flag.String('only').pipe(
  Flag.optional,
  Flag.map(Option.map((ids: string) => new Set(ids.split(',')))),
);
const dryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDefault(false),
  Flag.withDescription('print what would be generated, then stop'),
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
).pipe(Command.withDescription('Rebuild narration/full.mp3 from the current takes and sound'));

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
    const report = sceneReport(placed, input.scene);
    for (const line of report.lines) yield* Console.log(line);
    if (report.late > 0) return yield* CuesLate.make({ count: report.late });
  }),
).pipe(
  Command.withDescription(
    "Print each scene's placement, marks and named cues; fails when a cue ends after its scene",
  ),
);

const root = Command.make('film').pipe(
  Command.withDescription('Narrate, score, mix and inspect a cut-paper film'),
  Command.withSubcommands([narrate, score, mix, cues]),
);

const Platform = BunServices.layer;
const Store = ContentStore.layer.pipe(Layer.provide(Platform));
const Tools = Layer.mergeAll(Ffmpeg.layer, ElevenLabs.layer).pipe(Layer.provide(Platform));
const Repo = FilmRepo.layer.pipe(Layer.provide([Store, Platform]));
const Services = Layer.mergeAll(Narrator.layer, Composer.layer, Mixer.layer).pipe(
  Layer.provideMerge(Layer.mergeAll(Repo, Store, Tools, Platform)),
);

Command.run(root, { version: '0.1.0' }).pipe(Effect.provide(Services), BunRuntime.runMain);
