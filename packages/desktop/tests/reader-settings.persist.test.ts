import { it } from '@effect/vitest';
import { Effect, Layer, Option, Ref } from 'effect';
import { TestClock } from 'effect/testing';
import { expect } from 'vitest';
import { ReaderSettings, type ReaderFontScale } from '../src/services/reader-settings.js';
import { SettingsStorage } from '../src/services/settings-storage.js';

const SCALES: ReadonlyArray<ReaderFontScale> = ['sm', 'base', 'lg', 'xl', '2xl', '3xl'];

const makeStorageHarness = Effect.gen(function* () {
  const current = yield* Ref.make<Option.Option<string>>(Option.none());
  const writes = yield* Ref.make(0);
  return { refs: { current, writes }, layer: SettingsStorage.layerTest({ current, writes }) };
});

it.effect('collapses a burst of mutations into a single debounced write', () =>
  Effect.gen(function* () {
    const harness = yield* makeStorageHarness;
    yield* Effect.gen(function* () {
      const s = yield* ReaderSettings;
      // Rapid setter calls within the debounce window — cycle through each
      // scale token so we exercise the same "burst" the slider used to produce.
      for (const scale of SCALES) yield* s.setFontSize(scale);

      // Mid-burst: no write should have landed yet.
      yield* TestClock.adjust('100 millis');
      expect(yield* Ref.get(harness.refs.writes)).toBe(0);

      // Past the debounce window: exactly one write should land with the
      // final value ('3xl'), not separate writes for each intermediate.
      yield* TestClock.adjust('200 millis');
      expect(yield* Ref.get(harness.refs.writes)).toBe(1);
      const persisted = yield* Ref.get(harness.refs.current);
      expect(Option.isSome(persisted)).toBe(true);
      if (Option.isSome(persisted)) {
        const parsed = JSON.parse(persisted.value) as { fontSize: string };
        expect(parsed.fontSize).toBe('3xl');
      }
    }).pipe(Effect.provide(Layer.provide(ReaderSettings.layer, harness.layer)));
  }),
);

it.effect('clamps out-of-range setter values before persisting', () =>
  Effect.gen(function* () {
    const harness = yield* makeStorageHarness;
    yield* Effect.gen(function* () {
      const s = yield* ReaderSettings;
      yield* s.setLineWidth(-50); // below min (40)
      yield* s.setLineWidth(9999); // above max (120)
      yield* TestClock.adjust('300 millis');

      const persisted = yield* Ref.get(harness.refs.current);
      expect(Option.isSome(persisted)).toBe(true);
      if (Option.isSome(persisted)) {
        const parsed = JSON.parse(persisted.value) as { lineWidth: number };
        expect(parsed.lineWidth).toBe(120);
      }
    }).pipe(Effect.provide(Layer.provide(ReaderSettings.layer, harness.layer)));
  }),
);

it.effect('seeds state from previously persisted settings on layer init', () =>
  Effect.gen(function* () {
    const current = yield* Ref.make<Option.Option<string>>(
      Option.some(
        JSON.stringify({
          theme: 'dark',
          fontFamily: 'sans',
          fontSize: 'xl',
          lineHeight: 1.6,
          letterSpacing: 0.01,
          lineWidth: 72,
          uiScale: 'lg',
          recentDocuments: [{ path: '/path/last.pdf', title: 'Moby Dick' }],
          progressByPath: { '/path/last.pdf': 0.42 },
          debugDumpSegments: false,
        }),
      ),
    );
    const writes = yield* Ref.make(0);
    const storageLayer = SettingsStorage.layerTest({ current, writes });

    yield* Effect.gen(function* () {
      const s = yield* ReaderSettings;
      const state = yield* s.get;
      expect(state.theme).toBe('dark');
      expect(state.fontFamily).toBe('sans');
      expect(state.fontSize).toBe('xl');
      expect(state.lineHeight).toBe(1.6);
      expect(state.letterSpacing).toBe(0.01);
      expect(state.lineWidth).toBe(72);
      expect(state.uiScale).toBe('lg');
      expect(state.recentDocuments).toEqual([{ path: '/path/last.pdf', title: 'Moby Dick' }]);
      expect(state.progressByPath).toEqual({ '/path/last.pdf': 0.42 });
      expect(state.debugDumpSegments).toBe(false);
    }).pipe(Effect.provide(Layer.provide(ReaderSettings.layer, storageLayer)));
  }),
);
