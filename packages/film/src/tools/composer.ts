// Generate a film's score. It is current while the hash of its request
// matches, like a voice take: the score's plan is timed from the film's
// layout, so re-timing a scene makes the score stale, while changing its gain
// never does. Effects and beds are the app's sound library's (`sfx make`), not
// the film's.

import { Context, Duration, Effect, FileSystem, Layer, Option, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import type { Asset, SoundManifest } from '../core/schema.ts';
import { ContentStore, type StoreError, isStale } from './content-store.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type ActTooShort,
  type ElevenLabsFailed,
  SoundMissing,
  type UnknownScene,
} from './errors.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';

export interface ScoreOptions {
  /** Compose the score again even when it is current. */
  readonly force: boolean;
  /** Print the plan and whether the score would be composed, then stop. */
  readonly dryRun: boolean;
}

export type ScoreError =
  | SoundMissing
  | PlaceError
  | UnknownScene
  | ActTooShort
  | ElevenLabsFailed
  | StoreError
  | PlatformError;

const hashOf = (asset: Asset): string => asset.hash;

/** The manifest with the music set or cleared; `music` is omitted, never undefined. */
const withMusic = (music: Option.Option<Asset>): SoundManifest =>
  Option.match(music, {
    onNone: () => ({}),
    onSome: (asset) => ({ music: asset }),
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
        const manifest = film.paths.manifest;
        const declared = Option.fromNullishOr(sound.music);
        if (Option.isNone(declared)) {
          yield* Effect.log(`score.plan film=${name} to_generate=none reason="no score declared"`);
          // A score the film no longer declares is dropped; its file stays until pruned by hand.
          if (!options.dryRun) yield* store.update(manifest, () => withMusic(Option.none()));
          return;
        }
        const music = declared.value;
        const placed = yield* placeFilm(film);
        const plan = yield* Effect.fromResult(musicPlan(music, placed));
        const hash = musicKey(music, plan);
        const acts = plan.chunks.map((c) => `${c.text}:${(c.duration_ms / 1000).toFixed(1)}`);
        yield* Effect.log(`score.acts secs=${filmEnd(placed).toFixed(1)} acts=${acts.join(' | ')}`);
        const stored = Option.map(Option.fromNullishOr(film.manifest.music), hashOf);
        const stale = isStale(stored, hash, options.force);
        let planned = 'none';
        if (stale) planned = 'music';
        yield* Effect.log(`score.plan film=${name} to_generate=${planned}`);
        if (options.dryRun || !stale) return;

        yield* fs.makeDirectory(film.paths.sound, { recursive: true });
        const file = `music-${hash}.mp3`;
        const [took] = yield* Effect.timed(
          store.ensure({
            manifest,
            hash,
            force: options.force,
            stored: (m) => Option.map(Option.fromNullishOr(m.music), hashOf),
            produce: elevenLabs.composeMusic(plan, music.model, path.join(film.paths.sound, file)),
            record: () => withMusic(Option.some({ hash, file })),
          }),
        );
        yield* Effect.log(
          `score.made id=music secs=${(Duration.toMillis(took) / 1000).toFixed(1)}`,
        );
      });

      return Composer.of({ score });
    }),
  );
}
