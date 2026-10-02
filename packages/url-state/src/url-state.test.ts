import { Effect, Fiber, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import * as Codec from './codec.js';
import * as Field from './field.js';
import { Location } from './location.js';
import { layerMemory, LocationHistory } from './location-memory.js';
import * as Place from './place.js';
import * as UrlState from './url-state.js';

const start: Codec.MediaTime = { _tag: 'Point', at: 0 };

const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({
    cue: Field.key(Codec.Text, { default: '', history: 'push' }),
    knob: Field.key(Codec.Text, { default: '' }),
  }),
  hash: Field.struct({
    t: Field.key(Codec.MediaTime, { default: start, throttle: '250 millis' }),
  }),
});

const at = (seconds: number): Codec.MediaTime => ({ _tag: 'Point', at: seconds });

const stackOf = Effect.gen(function* () {
  const { stack, index } = yield* (yield* LocationHistory).entries;
  return { entries: stack.map((entry) => `${entry.navigation} ${entry.href}`), index };
});

/** The next `count` entries `Location` commits after the one on screen. */
const nextEntries = (count: number) =>
  Effect.gen(function* () {
    const location = yield* Location;
    return yield* location.changes.pipe(
      Stream.drop(1),
      Stream.map((entry) => `${entry.navigation} ${entry.href}`),
      Stream.take(count),
      Stream.runCollect,
      Effect.forkChild({ startImmediately: true }),
    );
  });

const memory = (href: string) => UrlState.layer.pipe(Layer.provideMerge(layerMemory(href)));

describe('UrlState', () => {
  it.effect('two writes in one tick make one entry, and Back restores the one before', () =>
    Effect.gen(function* () {
      const committed = yield* nextEntries(1);
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, knob: 'k' } }));
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, cue: 'c' } }));
      // Both writes read the URL as the first left it.
      expect(yield* UrlState.get(Lab)).toEqual(
        Option.some({
          path: { film: 'f', scene: 's' },
          query: { cue: 'c', knob: 'k' },
          hash: { t: start },
        }),
      );
      expect(yield* Fiber.join(committed)).toEqual(['push /films/f/lab/s?cue=c&knob=k']);
      expect(yield* stackOf).toEqual({
        entries: ['load /films/f/lab/s', 'push /films/f/lab/s?cue=c&knob=k'],
        index: 1,
      });

      const restored = yield* UrlState.changes(Lab).pipe(
        Stream.drop(1),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* (yield* LocationHistory).back;
      expect(yield* Fiber.join(restored)).toEqual([
        Option.some({
          path: { film: 'f', scene: 's' },
          query: { cue: '', knob: '' },
          hash: { t: start },
        }),
      ]);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('a refinement replaces and a citable key pushes', () =>
    Effect.gen(function* () {
      const committed = yield* nextEntries(2);
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, knob: 'k' } }));
      yield* Effect.yieldNow;
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, cue: 'c' } }));
      expect(yield* Fiber.join(committed)).toEqual([
        'replace /films/f/lab/s?knob=k',
        'push /films/f/lab/s?cue=c&knob=k',
      ]);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('a path change pushes; a write that changes nothing writes nothing', () =>
    Effect.gen(function* () {
      const committed = yield* nextEntries(1);
      yield* UrlState.update(Lab, (value) => value);
      yield* UrlState.update(Lab, (value) => ({
        ...value,
        path: { ...value.path, scene: 'roof' },
      }));
      expect(yield* Fiber.join(committed)).toEqual(['push /films/f/lab/roof']);
      expect((yield* stackOf).entries).toHaveLength(2);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('throttled writes flush at once, then once per window, with the last value', () =>
    Effect.gen(function* () {
      const committed = yield* nextEntries(2);
      const seek = (seconds: number) =>
        UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(seconds) } }));
      yield* seek(1);
      yield* Effect.yieldNow;
      yield* seek(2);
      yield* Effect.yieldNow;
      yield* seek(3);
      // The URL as the program sees it moves at once; the entry waits.
      expect(Option.map(yield* UrlState.get(Lab), (value) => value.hash.t)).toEqual(
        Option.some(at(3)),
      );
      yield* TestClock.adjust('250 millis');
      expect(yield* Fiber.join(committed)).toEqual([
        'replace /films/f/lab/s#t=1',
        'replace /films/f/lab/s#t=3',
      ]);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('an unthrottled write takes a waiting throttled batch with it now', () =>
    Effect.gen(function* () {
      const committed = yield* nextEntries(2);
      yield* UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(1) } }));
      yield* Effect.yieldNow;
      yield* UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(2) } }));
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, cue: 'c' } }));
      expect(yield* Fiber.join(committed)).toEqual([
        'replace /films/f/lab/s#t=1',
        'push /films/f/lab/s?cue=c#t=2',
      ]);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('Back drops a write that has not flushed', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      yield* location.push('/films/f/lab/two');
      const landed = yield* UrlState.changes(Lab).pipe(
        Stream.filter(Option.exists((value) => value.path.scene === 's')),
        Stream.take(1),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(1) } }));
      yield* (yield* LocationHistory).back;
      yield* Fiber.join(landed);
      yield* TestClock.adjust('1 second');
      expect(yield* stackOf).toEqual({
        entries: ['load /films/f/lab/s', 'push /films/f/lab/two'],
        index: 0,
      });
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('an entry landing from outside while a batch waits drops it and shows', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      const seek = (seconds: number) =>
        UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(seconds) } }));
      yield* seek(1);
      yield* Effect.yieldNow;
      yield* seek(2);
      yield* location.push('/films/f/lab/other');
      yield* TestClock.adjust('1 second');
      const state = yield* UrlState.UrlState;
      expect(yield* state.changes.pipe(Stream.take(1), Stream.runCollect)).toEqual([
        '/films/f/lab/other',
      ]);
      expect(yield* state.href).toBe('/films/f/lab/other');
      expect((yield* stackOf).entries).toEqual([
        'replace /films/f/lab/s#t=1',
        'push /films/f/lab/other',
      ]);
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('a batch that ends where the entry is writes nothing', () =>
    Effect.gen(function* () {
      const cue = (value: string) =>
        UrlState.update(Lab, (current) => ({
          ...current,
          query: { ...current.query, cue: value },
        }));
      yield* cue('b');
      yield* cue('a');
      yield* TestClock.adjust('1 second');
      expect(yield* stackOf).toEqual({ entries: ['load /films/f/lab/s?cue=a'], index: 0 });
    }).pipe(Effect.provide(memory('/films/f/lab/s?cue=a'))),
  );

  it.effect('a window that grows while the flush waits is waited out', () =>
    Effect.gen(function* () {
      const Scrub = Place.make({
        path: '/scrub',
        hash: Field.struct({
          a: Field.key(Codec.Text, { default: '', throttle: '50 millis' }),
          b: Field.key(Codec.Text, { default: '', throttle: '250 millis' }),
        }),
      });
      const write = (key: 'a' | 'b', value: string) =>
        UrlState.update(Scrub, (current) => ({
          ...current,
          hash: { ...current.hash, [key]: value },
        }));
      yield* write('a', '1');
      yield* Effect.yieldNow;
      yield* write('a', '2');
      yield* Effect.yieldNow;
      yield* write('b', '1');
      yield* TestClock.adjust('50 millis');
      expect((yield* stackOf).entries).toEqual(['replace /scrub#a=1']);
      yield* TestClock.adjust('200 millis');
      expect((yield* stackOf).entries).toEqual(['replace /scrub#a=2&b=1']);
    }).pipe(Effect.provide(memory('/scrub'))),
  );

  it.effect('a write made while a flush commits is committed too', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      // An entry subscriber that answers the flush's own push with a write,
      // as the push lands.
      yield* location.changes.pipe(
        Stream.filter((entry) => entry.navigation === 'push'),
        Stream.take(1),
        Stream.runForEach(() =>
          UrlState.update(Lab, (value) => ({ ...value, hash: { t: at(2) } })),
        ),
        Effect.forkChild({ startImmediately: true }),
      );
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, cue: 'c' } }));
      yield* TestClock.adjust('1 second');
      const state = yield* UrlState.UrlState;
      expect(yield* state.href).toBe('/films/f/lab/s?cue=c#t=2');
      expect(yield* stackOf).toEqual({
        entries: ['load /films/f/lab/s', 'replace /films/f/lab/s?cue=c#t=2'],
        index: 1,
      });
    }).pipe(Effect.provide(memory('/films/f/lab/s'))),
  );

  it.effect('update off the place writes nothing', () =>
    Effect.gen(function* () {
      yield* UrlState.update(Lab, (value) => ({ ...value, query: { ...value.query, cue: 'c' } }));
      expect(yield* UrlState.get(Lab)).toEqual(Option.none());
      expect((yield* stackOf).entries).toEqual(['load /elsewhere']);
    }).pipe(Effect.provide(memory('/elsewhere'))),
  );
});
