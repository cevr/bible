import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { ReaderSettings } from '../src/services/reader-settings.js';

it.effect('round-trips every setter through the Ref-backed state', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    yield* s.themeChosen('dark');
    yield* s.fontFamilyChosen('sans');
    yield* s.fontSizeChosen('xl');
    yield* s.lineHeightAdjusted(1.7);
    yield* s.letterSpacingAdjusted(0.02);
    yield* s.lineWidthAdjusted(72);
    yield* s.debugDumpSegmentsToggled;
    const state = yield* s.get;
    expect(state.theme).toBe('dark');
    expect(state.fontFamily).toBe('sans');
    expect(state.fontSize).toBe('xl');
    expect(state.lineHeight).toBe(1.7);
    expect(state.letterSpacing).toBe(0.02);
    expect(state.lineWidth).toBe(72);
    expect(state.debugDumpSegments).toBe(true);
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);

it.effect('seeds initial state on layer construction', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    const state = yield* s.get;
    expect(state.theme).toBe('light');
    expect(state.fontFamily).toBe('serif');
    expect(state.fontSize).toBe('base');
    expect(state.lineHeight).toBeCloseTo(1.55);
    expect(state.letterSpacing).toBe(0);
    expect(state.lineWidth).toBe(68);
    expect(state.recentDocuments).toEqual([]);
    expect(state.progressByPath).toEqual({});
    expect(state.debugDumpSegments).toBe(false);
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);

it.effect('touchRecentDocument promotes to front, dedupes, caps at 8', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    // Touch 10 distinct docs: cap at 8, most-recent first.
    for (let i = 0; i < 10; i++) yield* s.touchRecentDocument(`/path/${i}.pdf`);
    let state = yield* s.get;
    expect(state.recentDocuments.length).toBe(8);
    expect(state.recentDocuments[0]?.path).toBe('/path/9.pdf');
    expect(state.recentDocuments[7]?.path).toBe('/path/2.pdf');

    // Re-touching a doc promotes it to the front without growing the list.
    yield* s.touchRecentDocument('/path/2.pdf');
    state = yield* s.get;
    expect(state.recentDocuments.length).toBe(8);
    expect(state.recentDocuments[0]?.path).toBe('/path/2.pdf');
    expect(state.recentDocuments[1]?.path).toBe('/path/9.pdf');
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);

it.effect('touchRecentDocument stores title and preserves it on re-touch without one', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    yield* s.touchRecentDocument('/doc.pdf', 'Moby Dick');
    let state = yield* s.get;
    expect(state.recentDocuments[0]).toEqual({ path: '/doc.pdf', title: 'Moby Dick' });

    // Re-touching without a title must NOT clobber the known one.
    yield* s.touchRecentDocument('/doc.pdf');
    state = yield* s.get;
    expect(state.recentDocuments[0]).toEqual({ path: '/doc.pdf', title: 'Moby Dick' });

    // Re-touching WITH a different title overrides.
    yield* s.touchRecentDocument('/doc.pdf', 'The Whale');
    state = yield* s.get;
    expect(state.recentDocuments[0]).toEqual({ path: '/doc.pdf', title: 'The Whale' });
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);

it.effect('forgetDocument removes path AND wipes its progress', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    yield* s.touchRecentDocument('/a.pdf');
    yield* s.touchRecentDocument('/b.pdf');
    yield* s.progressRecorded('/a.pdf', 0.42);
    yield* s.progressRecorded('/b.pdf', 0.6);

    yield* s.forgetDocument('/a.pdf');
    const state = yield* s.get;
    expect(state.recentDocuments.map((r) => r.path)).toEqual(['/b.pdf']);
    expect(state.progressByPath).toEqual({ '/b.pdf': 0.6 });
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);

it.effect('progressRecorded clamps to [0, 1]', () =>
  Effect.gen(function* () {
    const s = yield* ReaderSettings;
    yield* s.progressRecorded('/over.pdf', 1.5);
    yield* s.progressRecorded('/under.pdf', -0.2);
    yield* s.progressRecorded('/mid.pdf', 0.37);
    const state = yield* s.get;
    expect(state.progressByPath['/over.pdf']).toBe(1);
    expect(state.progressByPath['/under.pdf']).toBe(0);
    expect(state.progressByPath['/mid.pdf']).toBe(0.37);
  }).pipe(Effect.provide(ReaderSettings.layerTest())),
);
