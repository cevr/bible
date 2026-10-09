import { Context, Effect, Fiber, Layer, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { TestClock } from 'effect/testing';

import { Location, type Entry } from './location.js';
import { layerMemory, LocationHistory } from './testing.js';
import { layerServer } from './location-server.js';

const hrefs = Effect.gen(function* () {
  const { stack, index } = yield* (yield* LocationHistory).entries;
  return { hrefs: stack.map((entry) => entry.href), index };
});

describe('memory Location', () => {
  it.effect('a push adds an entry with a fresh key; a replace keeps the key', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      const loaded = yield* location.current;
      expect(loaded).toMatchObject({ href: '/?q=a', navigation: 'load' });

      yield* location.replace('/?q=a&scope=egw');
      const replaced = yield* location.current;
      expect(replaced).toEqual({ href: '/?q=a&scope=egw', key: loaded.key, navigation: 'replace' });

      yield* location.push('/?q=b');
      const pushed = yield* location.current;
      expect(pushed.navigation).toBe('push');
      expect(pushed.key).not.toBe(loaded.key);
      expect(yield* hrefs).toEqual({ hrefs: ['/?q=a&scope=egw', '/?q=b'], index: 1 });
    }).pipe(Effect.provide(layerMemory('/?q=a'))),
  );

  it.effect('Back and Forward land on each entry with the key it was given, as traversals', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      const history = yield* LocationHistory;
      const first = yield* location.current;
      yield* location.push('/b');
      const second = yield* location.current;

      yield* location.back;
      expect(yield* location.current).toEqual({ ...first, navigation: 'traverse' });
      expect(yield* hrefs).toEqual({ hrefs: ['/a', '/b'], index: 0 });
      // The memory layer's Back at the first entry stays there.
      yield* location.back;
      expect((yield* location.current).href).toBe('/a');

      yield* history.forward;
      expect(yield* location.current).toEqual({ ...second, navigation: 'traverse' });
      yield* history.forward;
      expect((yield* location.current).href).toBe('/b');
    }).pipe(Effect.provide(layerMemory('/a'))),
  );

  it.effect('a push after Back drops the entries ahead', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      yield* location.push('/b');
      yield* location.push('/c');
      yield* location.back;
      yield* location.push('/d');
      expect(yield* hrefs).toEqual({ hrefs: ['/a', '/b', '/d'], index: 2 });
    }).pipe(Effect.provide(layerMemory('/a'))),
  );

  it.effect('changes starts at the entry on screen and follows every write', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      const seen = yield* location.changes.pipe(
        Stream.map((entry) => `${entry.navigation} ${entry.href}`),
        Stream.take(4),
        Stream.runCollect,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* location.push('/b');
      yield* location.replace('/c');
      yield* location.back;
      expect(yield* Fiber.join(seen)).toEqual(['load /a', 'push /b', 'replace /c', 'traverse /a']);
    }).pipe(Effect.provide(layerMemory('/a'))),
  );

  it.effect('keys are the epoch milliseconds and a count, as stored entries hold them', () =>
    Effect.gen(function* () {
      // The test clock reads 0 when the layer is built.
      const location = yield* Location;
      expect((yield* location.current).key).toBe('0-1');
      yield* TestClock.setTime(1_700_000_000_000);
      yield* location.push('/b');
      expect((yield* location.current).key).toBe('1700000000000-2');
    }).pipe(Effect.provide(layerMemory('/a'))),
  );
});

describe('server Location', () => {
  it.effect('is the request URL without its hash, and ignores writes', () =>
    Effect.gen(function* () {
      const location = yield* Location;
      const entry: Entry = {
        href: '/films/a/lab/b?cue=c',
        key: 'server',
        navigation: 'load',
      };
      expect(yield* location.current).toEqual(entry);
      yield* location.push('/elsewhere');
      yield* location.replace('/elsewhere');
      yield* location.back;
      expect(yield* location.current).toEqual(entry);
      expect(yield* Stream.runCollect(location.changes)).toEqual([entry]);
    }).pipe(Effect.provide(layerServer('http://lab.test/films/a/lab/b?cue=c#t=4'))),
  );
});

describe('layers', () => {
  it.effect('two memory layers keep separate stacks', () =>
    Effect.gen(function* () {
      const one = Context.get(yield* Layer.build(layerMemory('/one')), Location);
      const two = Context.get(yield* Layer.build(layerMemory('/two')), Location);
      yield* one.push('/one/b');
      expect((yield* one.current).href).toBe('/one/b');
      expect((yield* two.current).href).toBe('/two');
    }).pipe(Effect.scoped),
  );
});
