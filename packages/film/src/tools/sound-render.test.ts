// The shared renderer of derived sounds: each source rendered once while it is
// kept and handed to every reader, and each seed of the derived sounds a film
// places measured once, the kept and generated ones left as the lock has them.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Result } from 'effect';
import {
  type DerivedSource,
  NO_SOUNDS,
  type Sounds,
  defineLibrary,
  measurePcm,
  renderSource,
  sourceLabel,
} from '../core/sfx.ts';
import { resolveCode } from '../core/synth/resolve.ts';
import { SoundRender } from './sound-render.ts';

const library = defineLibrary({
  'tone.tick': {
    kind: 'code',
    sound: { play: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.1 } },
    variants: 2,
    use: 'one-shot',
  },
  'tone.chime': {
    kind: 'procedural',
    recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 0.2 },
    variants: 1,
    use: 'one-shot',
  },
  'paper.tap': {
    kind: 'generated',
    prompt: 'a tap',
    why: 'a test sound',
    secs: 1,
    use: 'one-shot',
  },
});

const sounds: Sounds = {
  ...NO_SOUNDS,
  library,
  code: Result.getOrThrow(resolveCode(library)).code,
};

const tick = (seed: number): DerivedSource => ({
  _tag: 'Code',
  sound: sounds.code.get('tone.tick')!,
  seed,
});

describe('SoundRender', () => {
  it.effect('measures each seed of the derived sounds named, once, and no other sound', () =>
    Effect.gen(function* () {
      const render = yield* SoundRender;
      const measured = yield* render.measured(sounds, [
        'tone.tick',
        'paper.tap',
        'tone.chime',
        'tone.tick',
      ]);
      const labels = [...measured.measured.keys()];
      expect(labels).toEqual([
        sourceLabel(tick(1)),
        sourceLabel(tick(2)),
        sourceLabel({ _tag: 'Synth', recipe: library['tone.chime'].recipe, seed: 1 }),
      ]);
      expect(measured.measured.get(sourceLabel(tick(2)))).toEqual(
        measurePcm(renderSource(tick(2))),
      );
      // Nothing left to measure: the same sounds come back.
      expect(yield* render.measured(measured, ['tone.tick', 'tone.chime'])).toBe(measured);
    }).pipe(Effect.provide(SoundRender.layer)),
  );

  it.effect('renders a source once while it is kept, and shares its audio', () =>
    Effect.gen(function* () {
      const render = yield* SoundRender;
      const first = yield* render.pcm(tick(1));
      // A source written again is the same source: the same audio, not a second render.
      expect(yield* render.pcm(tick(1))).toBe(first);
      expect(yield* render.pcm(tick(2))).not.toBe(first);
      expect(first.frames).toBe(4410);
    }).pipe(Effect.provide(SoundRender.layer)),
  );
});
