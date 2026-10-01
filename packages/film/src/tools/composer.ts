// Compose a film's score: each of its options (`sound.ts`'s `score.options`),
// a whole score in its own musical language. An option is current while the
// hash of its request matches, like a voice take: its plan is timed from the
// film's layout, so re-timing a scene makes every option stale, while its
// levels never do. Each lands as `sound/<option>-<hash>.mp3`, recorded with
// the sha256 of its bytes; generated music may not sit in the public repo, so
// the file is git-ignored, kept in the private store (`sfx push`) and refused
// by the pre-commit guard. Effects and beds are the app's sound library's
// (`sfx make`), not the film's.

import { Console, Context, Duration, Effect, FileSystem, Layer, Option, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { Plan, Score, SoundManifest } from '../core/schema.ts';
import { filmEnd } from '../core/layout.ts';
import {
  MUSIC_TAIL,
  musicKey,
  musicPlan,
  playedOption,
  scoreOptionState,
  scoreOptions,
} from '../core/sound.ts';
import { ContentStore, type StoreError } from './content-store.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type MovementLength,
  CreditsOverCap,
  type ElevenLabsFailed,
  type ScoreUnknown,
  SoundMissing,
} from './errors.ts';
import type { PartError } from '../core/acts.ts';
import { sha256Hex } from './digest.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { TALLY_HEADER, talliedCredits } from './library.ts';

/**
 * What a minute of music costs, in credits (ElevenLabs' help centre, "How much
 * does Eleven Music cost?": about 900 credits a minute). An estimate for the
 * plan and the cap; the account's own count is the measure.
 */
const MUSIC_CREDITS_PER_MINUTE = 900;

/** The credits a plan is estimated to cost. */
export const musicCredits = (plan: Plan): number =>
  Math.ceil(
    (plan.chunks.reduce((sum, c) => sum + c.duration_ms, 0) / 60_000) * MUSIC_CREDITS_PER_MINUTE,
  );

export interface ScoreOptions {
  /** Compose again even when current. */
  readonly force: boolean;
  /** Print each option's plan, its cost and whether it would be composed, then stop. */
  readonly dryRun: boolean;
  /** Just this option; every stale one otherwise. */
  readonly only: Option.Option<string>;
  /** The most credits spent in all, counting what the tally already records. */
  readonly cap: Option.Option<number>;
  /** A TSV each composed option is appended to: name, hash, seconds, credits. */
  readonly tally: Option.Option<string>;
}

type ScoreError =
  | SoundMissing
  | ScoreUnknown
  | PlaceError
  | PartError
  | MovementLength
  | CreditsOverCap
  | ElevenLabsFailed
  | StoreError
  | PlatformError;

/** The manifest's scores narrowed to `keep`; `scores` is omitted, never undefined, when none are left. */
const keepScores = (manifest: SoundManifest, keep: ReadonlySet<string>): SoundManifest => {
  const scores = Object.fromEntries(
    Object.entries(manifest.scores ?? {}).filter(([name]) => keep.has(name)),
  );
  if (Object.keys(scores).length === 0) return {};
  return { scores };
};

interface ComposerService {
  readonly score: (film: LoadedFilm, options: ScoreOptions) => Effect.Effect<void, ScoreError>;
}

export class Composer extends Context.Service<Composer, ComposerService>()(
  '@bible/film/tools/Composer',
) {
  static readonly layer = Layer.effect(
    Composer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const elevenLabs = yield* ElevenLabs;

      const spentSoFar = (tally: Option.Option<string>) =>
        Option.match(tally, {
          onNone: () => Effect.succeed(0),
          onSome: (file) =>
            Effect.gen(function* () {
              if (!(yield* fs.exists(file))) return 0;
              return talliedCredits(yield* fs.readFileString(file));
            }),
        });

      const tallied = (tally: Option.Option<string>, line: string) =>
        Option.match(tally, {
          onNone: () => Effect.void,
          onSome: (file) =>
            Effect.gen(function* () {
              let text = TALLY_HEADER;
              if (yield* fs.exists(file)) text = yield* fs.readFileString(file);
              yield* fs.writeFileString(file, `${text}${line}\n`);
            }),
        });

      /** Which of the score's options this run looks at: `only` alone (`ScoreUnknown` when the score lacks it), or all. */
      const chosenOf = (score: Score, only: Option.Option<string>) =>
        Option.match(only, {
          onNone: () => Effect.succeed(scoreOptions(score)),
          onSome: (name) =>
            Effect.map(Effect.fromResult(playedOption(score, Option.some(name))), (o) => [o]),
        });

      const score = Effect.fn('Composer.score')(function* (
        film: LoadedFilm,
        options: ScoreOptions,
      ) {
        const name = film.paths.name;
        const sound = yield* Effect.fromOption(film.sound, () => SoundMissing.make({ film: name }));
        const manifest = film.paths.manifest;
        const declared = Option.fromNullishOr(sound.score);
        if (Option.isNone(declared)) {
          yield* Effect.log(`score.plan film=${name} to_compose=none reason="no score declared"`);
          // Options the film no longer declares are dropped; their files stay until pruned by hand.
          if (!options.dryRun) yield* store.update(manifest, (m) => keepScores(m, new Set()));
          return;
        }
        const all = scoreOptions(declared.value);
        const chosen = yield* chosenOf(declared.value, options.only);
        if (!options.dryRun)
          yield* store.update(manifest, (m) => keepScores(m, new Set(all.map((o) => o.name))));
        const placed = yield* placeFilm(film);
        const secs = filmEnd(placed);
        let spent = yield* spentSoFar(options.tally);
        let planned = 0;
        for (const option of chosen) {
          const plan = yield* Effect.fromResult(musicPlan(option.music, placed));
          const hash = musicKey(option.music, plan);
          const ms = plan.chunks.reduce((sum, c) => sum + c.duration_ms, 0);
          const credits = musicCredits(plan);
          const stale =
            options.force || scoreOptionState(option, placed, film.manifest)._tag !== 'Current';
          let state = 'current';
          if (stale) {
            state = 'to compose';
            planned += credits;
          }
          yield* Console.log(
            `option ${option.name}  ${option.music.model}  ${plan.chunks.length} movements  ${(ms / 1000).toFixed(1)}s (the film's ${secs.toFixed(1)}s and ${MUSIC_TAIL}s past its end)  ~${credits} credits  ${state}  (${hash})`,
          );
          yield* Console.log(`  styles  ${option.music.styles.join(', ')}`);
          yield* Console.log(`  avoid   ${option.music.avoid.join(', ')}`);
          for (const [i, chunk] of plan.chunks.entries())
            yield* Console.log(
              `  ${chunk.text.padEnd(20)} ${(chunk.duration_ms / 1000).toFixed(1).padStart(6)}s  ${(option.music.movements[i]?.styles ?? []).join(', ')}`,
            );
          if (options.dryRun || !stale) continue;

          if (Option.isSome(options.cap) && spent + credits > options.cap.value)
            return yield* CreditsOverCap.make({
              credits: spent + credits,
              cap: options.cap.value,
            });
          yield* fs.makeDirectory(film.paths.sound, { recursive: true });
          const file = `${option.name}-${hash}.mp3`;
          const at = path.join(film.paths.sound, file);
          const [took] = yield* Effect.timed(
            store.ensure({
              manifest,
              hash,
              force: options.force,
              stored: (m) =>
                Option.map(Option.fromUndefinedOr(m.scores?.[option.name]), (a) => a.hash),
              produce: elevenLabs.composeMusic(plan, option.music.model, at).pipe(
                Effect.flatMap(() => fs.readFile(at)),
                Effect.map(sha256Hex),
              ),
              record: (m, digest) => ({
                ...m,
                scores: { ...m.scores, [option.name]: { hash, file, sha256: digest } },
              }),
            }),
          );
          spent += credits;
          yield* tallied(
            options.tally,
            `score.${option.name}\t${hash}\t${(ms / 1000).toFixed(3)}\t${credits}`,
          );
          yield* Effect.log(
            `score.made option=${option.name} file=${file} secs=${(Duration.toMillis(took) / 1000).toFixed(1)} credits~${credits}`,
          );
        }
        let note = '';
        if (options.dryRun) note = ' (dry run: nothing composed)';
        yield* Console.log(`${chosen.length} options, ~${planned} credits to compose${note}`);
      });

      return Composer.of({ score });
    }),
  );
}
