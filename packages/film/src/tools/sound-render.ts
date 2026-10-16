// The one place a derived sound's audio is made and measured: a recipe's or a
// code sound's seed rendered (core/sfx.ts `renderSource`, pure), kept by its
// source, so a sound measured for a check and then mixed, or placed many
// times, renders once while it stays among the newest kept. A sound made here
// is shared by everything that asks for it: its readers never write into it.

import { Cache, Context, Effect, Layer, Option } from 'effect';
import type { Pcm } from '../core/audio.ts';
import {
  type DerivedSource,
  type Measure,
  type Sounds,
  isDerived,
  measurePcm,
  renderSource,
  seedSources,
  soundEntry,
  sourceLabel,
} from '../core/sfx.ts';

/** The made sounds kept: the newest this many (a 30 s bed is about 5 MB). */
const SOUNDS_KEPT = 64;
/** The measures kept: one for each seed of each sound, a few numbers each. */
const MEASURES_KEPT = 1024;

interface SoundRenderService {
  /** `source`'s audio: rendered once while it stays among the newest kept, and shared. */
  readonly pcm: (source: DerivedSource) => Effect.Effect<Pcm>;
  /** `source` measured as the lock measures a made variant: its loudness, onset and hit. */
  readonly measure: (source: DerivedSource) => Effect.Effect<Measure>;
  /** `sounds` with every seed of each derived sound among `names` measured. */
  readonly measured: (sounds: Sounds, names: Iterable<string>) => Effect.Effect<Sounds>;
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
        const fresh = sources.filter((source) => !sounds.measured.has(sourceLabel(source)));
        yield* Effect.annotateCurrentSpan({ seeds: fresh.length });
        if (fresh.length === 0) return sounds;
        const found = yield* Effect.forEach(fresh, (source) =>
          Effect.map(measure(source), (m): readonly [string, Measure] => [sourceLabel(source), m]),
        );
        return { ...sounds, measured: new Map([...sounds.measured, ...found]) };
      });
      return SoundRender.of({ pcm, measure, measured });
    }),
  );
}
