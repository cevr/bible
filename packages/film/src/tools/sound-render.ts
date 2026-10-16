// The one place a derived sound's audio is made and measured: a recipe's or a
// code sound's seed rendered (core/sfx.ts `renderSource`, pure), kept by its
// source, so a sound measured for a check and then mixed, or placed many
// times, renders once while it stays among the newest kept. A sound made here
// is shared by everything that asks for it: its readers never write into it.
// The film loader resolves a film's sounds and measures none; what reads how
// they play measures the ones the film places here (`measuredFilm`).

import { Cache, Context, Effect, Layer, Option } from 'effect';
import type { Pcm } from '../core/audio.ts';
import {
  type DerivedSource,
  type Measure,
  type MeasuredSounds,
  type Sounds,
  isDerived,
  measurePcm,
  placedSounds,
  renderSource,
  seedSources,
  soundEntry,
  sourceLabel,
} from '../core/sfx.ts';
import type { LoadedFilm, MeasuredFilm } from './film-repo.ts';

/** The made sounds kept: the newest this many (a 30 s bed is about 5 MB). */
const SOUNDS_KEPT = 64;
/** The measures kept: one for each seed of each sound, a few numbers each. */
const MEASURES_KEPT = 1024;

interface SoundRenderService {
  /** `source`'s audio: rendered once while it stays among the newest kept, and shared. */
  readonly pcm: (source: DerivedSource) => Effect.Effect<Pcm>;
  /** `source` measured as the lock measures a made variant: its loudness, onset and hit. */
  readonly measure: (source: DerivedSource) => Effect.Effect<Measure>;
  /** `sounds` with every seed of each derived sound among `names` measured, and no other. */
  readonly measured: (sounds: Sounds, names: Iterable<string>) => Effect.Effect<MeasuredSounds>;
}

export class SoundRender extends Context.Service<SoundRender, SoundRenderService>()(
  '@bible/film/tools/SoundRender',
) {
  /** Its caches, one for the process: provided once, in `filmServices`. */
  static readonly layer = Layer.effect(
    SoundRender,
    Effect.gen(function* () {
      const made = yield* Cache.make({
        lookup: (source: DerivedSource) => Effect.sync(() => renderSource(source)),
        capacity: SOUNDS_KEPT,
      });
      const pcm = Effect.fn('SoundRender.pcm')(function* (source: DerivedSource) {
        const sound = yield* Cache.get(made, source);
        yield* Effect.annotateCurrentSpan({ label: sourceLabel(source), frames: sound.frames });
        return sound;
      });
      const measures = yield* Cache.make({
        lookup: (source: DerivedSource) => Effect.map(pcm(source), measurePcm),
        capacity: MEASURES_KEPT,
      });
      const measure = Effect.fn('SoundRender.measure')(function* (source: DerivedSource) {
        yield* Effect.annotateCurrentSpan({ label: sourceLabel(source) });
        return yield* Cache.get(measures, source);
      });
      const measured = Effect.fn('SoundRender.measured')(function* (
        sounds: Sounds,
        names: Iterable<string>,
      ) {
        const sources = [...new Set(names)].flatMap((name) =>
          Option.match(Option.filter(soundEntry(sounds.library, name), isDerived), {
            onNone: (): ReadonlyArray<DerivedSource> => [],
            onSome: (entry) => seedSources(sounds, name, entry),
          }),
        );
        yield* Effect.annotateCurrentSpan({ seeds: sources.length });
        const found = yield* Effect.forEach(sources, (source) =>
          Effect.map(measure(source), (m): readonly [string, Measure] => [sourceLabel(source), m]),
        );
        const heard: MeasuredSounds = { ...sounds, measured: new Map(found) };
        return heard;
      });
      return SoundRender.of({ pcm, measure, measured });
    }),
  );
}

/**
 * `film` with each seed of every derived sound its `sound.ts` places
 * measured, through the process's one renderer: what reads how a film's
 * sounds play (a mix plan, the check's lead-in, a seed's line) measures
 * here, where it reads. A seed already measured comes from the cache.
 */
export const measuredFilm = Effect.fn('SoundRender.film')(function* (film: LoadedFilm) {
  const sounds = yield* (yield* SoundRender).measured(
    film.sounds,
    Option.match(film.sound, { onNone: () => [], onSome: placedSounds }),
  );
  const measured: MeasuredFilm = { ...film, sounds };
  return measured;
});
