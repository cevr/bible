// Generate a film's music and sound effects. An asset is current while the
// hash of its request matches, like a voice take: the score's plan is timed
// from the film's layout, so re-timing a scene makes the score stale, while
// changing a gain never does. Without an API key, effects are skipped with a
// warning and the music is still made.

import { Context, Duration, Effect, FileSystem, Layer, Option, Path, Record as Rec } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import type { Asset, SoundManifest } from '../core/schema.ts';
import { ContentStore, type StoreError, isStale } from './content-store.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type ActTooShort,
  type ApiKeyMissing,
  type ElevenLabsFailed,
  type LayoutInvalid,
  SoundMissing,
  type UnknownScene,
} from './errors.ts';
import { type LoadedFilm, placeFilm } from './film-repo.ts';
import { settleAll } from './settle.ts';

export interface ScoreOptions {
  /** Regenerate just these assets (`music` or effect ids), current or not. */
  readonly only: Option.Option<ReadonlySet<string>>;
  /** Print the plan and what would be generated, then stop. */
  readonly dryRun: boolean;
}

export type ScoreError =
  | SoundMissing
  | LayoutInvalid
  | UnknownScene
  | ActTooShort
  | ElevenLabsFailed
  | ApiKeyMissing
  | StoreError
  | PlatformError;

interface Job {
  readonly id: string;
  readonly run: Effect.Effect<unknown, ElevenLabsFailed | ApiKeyMissing | StoreError>;
}

const hashOf = (asset: Asset): string => asset.hash;

/** The manifest with the music set or cleared; `music` is omitted, never undefined. */
const withMusic = (manifest: SoundManifest, music: Option.Option<Asset>): SoundManifest =>
  Option.match(music, {
    onNone: () => ({ effects: manifest.effects }),
    onSome: (asset) => ({ music: asset, effects: manifest.effects }),
  });

export interface ComposerService {
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

      const score = Effect.fn('Composer.score')(function* (
        film: LoadedFilm,
        options: ScoreOptions,
      ) {
        const name = film.paths.name;
        const sound = yield* Option.match(film.sound, {
          onNone: () => Effect.fail(SoundMissing.make({ film: name })),
          onSome: Effect.succeed,
        });
        const placed = yield* placeFilm(film);
        const manifest = film.paths.manifest;
        const forced = (id: string) => Option.exists(options.only, (only) => only.has(id));
        const wanted = (id: string, stored: Option.Option<string>, hash: string) =>
          Option.match(options.only, {
            onSome: (only) => only.has(id),
            onNone: () => isStale(stored, hash, false),
          });
        const jobs: Array<Job> = [];

        const score = Option.fromNullishOr(sound.music);
        if (Option.isSome(score)) {
          const music = score.value;
          const plan = yield* Effect.fromResult(musicPlan(music, placed));
          const hash = musicKey(music, plan);
          const acts = plan.chunks.map((c) => `${c.text}:${(c.duration_ms / 1000).toFixed(1)}`);
          yield* Effect.log(
            `score.acts secs=${filmEnd(placed).toFixed(1)} acts=${acts.join(' | ')}`,
          );
          const stored = Option.map(Option.fromNullishOr(film.manifest.music), hashOf);
          if (wanted('music', stored, hash)) {
            const file = `music-${hash}.mp3`;
            jobs.push({
              id: 'music',
              run: store.ensure({
                manifest,
                hash,
                force: forced('music'),
                stored: (m) => Option.map(Option.fromNullishOr(m.music), hashOf),
                produce: elevenLabs.composeMusic(
                  plan,
                  music.model,
                  path.join(film.paths.sound, file),
                ),
                record: (m) => withMusic(m, Option.some({ hash, file })),
              }),
            });
          }
        }

        const staleEffects = Object.entries(sound.effects).filter(([id, fx]) =>
          wanted(id, Option.map(Rec.get(film.manifest.effects, id), hashOf), effectKey(fx)),
        );
        // The OAuth login cannot reach sound generation; an API key can.
        const keyed =
          staleEffects.length > 0 &&
          (yield* elevenLabs.apiKey.pipe(
            Effect.as(true),
            Effect.catchTag('ApiKeyMissing', (missing) =>
              Effect.logWarning(
                `score.skip effects=${staleEffects.map(([id]) => id).join(',')} reason="${missing.message}"`,
              ).pipe(Effect.as(false)),
            ),
          ));
        if (keyed)
          for (const [id, fx] of staleEffects) {
            const hash = effectKey(fx);
            const file = `sfx-${id}-${hash}.mp3`;
            jobs.push({
              id,
              run: store.ensure({
                manifest,
                hash,
                force: forced(id),
                stored: (m) => Option.map(Rec.get(m.effects, id), hashOf),
                produce: elevenLabs.soundEffect(
                  { prompt: fx.prompt, secs: fx.secs },
                  path.join(film.paths.sound, file),
                ),
                record: (m) => ({ ...m, effects: { ...m.effects, [id]: { hash, file } } }),
              }),
            });
          }

        const ids = jobs.map((j) => j.id);
        yield* Effect.log(`score.plan film=${name} to_generate=${ids.join(',') || 'none'}`);
        if (options.dryRun) return;

        yield* fs.makeDirectory(film.paths.sound, { recursive: true });
        // A few at a time, each saved as it lands so a failure keeps what already worked.
        yield* settleAll(
          jobs,
          (job) =>
            Effect.timed(job.run).pipe(
              Effect.tap(([took]) =>
                Effect.log(
                  `score.made id=${job.id} secs=${(Duration.toMillis(took) / 1000).toFixed(1)}`,
                ),
              ),
            ),
          3,
        );

        // Drop assets the design no longer names; the files stay until pruned by hand.
        yield* store.update(manifest, (m) => {
          const effects = Object.entries(m.effects).filter(([id]) =>
            Object.hasOwn(sound.effects, id),
          );
          const kept = { ...m, effects: Object.fromEntries(effects) };
          if (Option.isNone(score)) return withMusic(kept, Option.none());
          return kept;
        });
      });

      return Composer.of({ score });
    }),
  );
}
