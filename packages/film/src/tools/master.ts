// The film's mixed track on disk: where it is, how long it measures, and
// whether it covers the film. The mixer writes it; the renderer, `sync` and
// `check` hold it to the film's length.

import { Effect, type FileSystem, Option } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { AudioMissing, AudioStale, type MediaFailed } from './errors.ts';
import type { FilmPaths } from './film-repo.ts';
import type { MediaService } from './media.ts';

/** The film's mixed track (16-bit WAV): the renderer encodes from it, `sync` previews it. */
export const masterFile = (paths: FilmPaths): string => `${paths.narration}/full.wav`;

/** The track's measured length in seconds, or none when there is no track. */
export const measureMaster = (
  fs: FileSystem.FileSystem,
  media: MediaService,
  file: string,
): Effect.Effect<Option.Option<number>, MediaFailed | PlatformError> =>
  Effect.gen(function* () {
    if (!(yield* fs.exists(file))) return Option.none();
    return Option.some(yield* media.duration(file));
  });

/**
 * How far the audio master may differ from the film's length: a frame at 60
 * fps, no looser than a render's one frame at any rate up to that. A mix is
 * trimmed to the film's length, so a current master is exact.
 */
export const MASTER_TOLERANCE = 1 / 60;

/**
 * The track against the film it must cover: missing, or longer or shorter
 * than `seconds` by more than `tolerance` (a frame), it is not this film's
 * track. A mix is exactly the film's length, so a current one always passes.
 */
export const masterFinding = (
  file: string,
  length: Option.Option<number>,
  seconds: number,
  tolerance: number,
): Option.Option<AudioMissing | AudioStale> =>
  Option.match(length, {
    onNone: () => Option.some(AudioMissing.make({ file })),
    onSome: (measured) =>
      Option.liftPredicate(
        AudioStale.make({ file, length: measured, film: seconds }),
        () => Math.abs(measured - seconds) > tolerance,
      ),
  });
