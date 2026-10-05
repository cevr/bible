import { test } from 'bun:test';
import { Context, Effect, Layer, Option, Scope, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import * as UrlAtom from './atom.js';
import * as Codec from './codec.js';
import * as Field from './field.js';
import { Location } from './location.js';
import { layerMemory, LocationHistory } from './location-memory.js';
import { layerServer } from './location-server.js';
import * as Place from './place.js';
import * as UrlState from './url-state.js';

const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({
    cue: Field.key(Codec.Text, { default: '', history: 'push' }),
    knob: Field.key(Codec.Text, { default: '' }),
  }),
  hash: Field.struct({ t: Field.key(Codec.Finite, { default: 0 }) }),
});
const lab = UrlAtom.place(Lab);

const Scene = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
});
const scene = UrlAtom.place(Scene);

/** A registry over a `Location` layer built here, so a test can drive it. */
const registryOver = <R>(location: Layer.Layer<R>) => {
  const context = Effect.runSync(Layer.buildWithScope(location, Scope.makeUnsafe()));
  const registry = AtomRegistry.make({
    initialValues: [[UrlAtom.layer, Layer.succeedContext(context)]],
  });
  return { registry, context };
};

const memoryRegistry = (href: string) => {
  const { registry, context } = registryOver(layerMemory(href));
  const stack = Context.get(context, LocationHistory).entries.pipe(
    Effect.map(({ stack }) => stack.map((entry) => `${entry.navigation} ${entry.href}`)),
  );
  return { registry, stack, location: Context.get(context, Location) };
};

/** Waits until the atom's value holds `predicate`, and returns it. */
const until = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  predicate: (value: A) => boolean,
) =>
  Effect.callback<A>((resume) => {
    const unsubscribe = registry.subscribe(
      atom,
      (value) => {
        if (predicate(value)) resume(Effect.succeed(value));
      },
      { immediate: true },
    );
    return Effect.sync(unsubscribe);
  });

const labOf = (registry: AtomRegistry.AtomRegistry) => Option.getOrThrow(registry.get(lab));

describe('UrlAtom', () => {
  test('a place reads synchronously from the URL', () => {
    const { registry } = memoryRegistry('/films/f/lab/s?cue=c#t=2');
    expect(registry.get(lab)).toEqual(
      Option.some({
        path: { film: 'f', scene: 's' },
        query: { cue: 'c', knob: '' },
        hash: { t: 2 },
      }),
    );
    expect(registry.get(UrlAtom.href)).toBe('/films/f/lab/s?cue=c#t=2');
  });

  it.effect('writes in one tick make one entry, and every place agrees within the tick', () =>
    Effect.gen(function* () {
      const { registry, stack } = memoryRegistry('/films/f/lab/s');
      const unmount = registry.mount(scene);
      const read = () => labOf(registry);
      registry.set(lab, { ...read(), query: { ...read().query, knob: 'k' } });
      registry.set(lab, { ...read(), query: { ...read().query, cue: 'c' } });
      registry.set(lab, { ...read(), path: { ...read().path, scene: 'roof' } });
      expect(registry.get(UrlAtom.href)).toBe('/films/f/lab/roof?cue=c&knob=k');
      expect(Option.map(registry.get(scene), (value) => value.path.scene)).toEqual(
        Option.some('roof'),
      );
      yield* until(registry, UrlAtom.entry, (entry) => entry.navigation === 'push');
      expect(yield* stack).toEqual(['load /films/f/lab/s', 'push /films/f/lab/roof?cue=c&knob=k']);
      unmount();
    }),
  );

  it.effect('Back lands on the atoms, with the entry it arrived as', () =>
    Effect.gen(function* () {
      const { registry, location } = memoryRegistry('/films/f/lab/s');
      const unmount = registry.mount(lab);
      registry.set(lab, { ...labOf(registry), query: { ...labOf(registry).query, cue: 'c' } });
      const pushed = yield* until(registry, UrlAtom.entry, (entry) => entry.navigation === 'push');
      yield* location.back;
      const landed = yield* until(registry, UrlAtom.entry, (entry) => entry.key !== pushed.key);
      expect(landed.navigation).toBe('traverse');
      expect(labOf(registry).query.cue).toBe('');
      unmount();
    }),
  );

  it.effect('a write the program makes elsewhere reaches the atoms', () =>
    Effect.gen(function* () {
      const { registry, location } = memoryRegistry('/films/f/lab/s');
      yield* location.push('/films/f/lab/s?cue=elsewhere');
      const value = yield* until(
        registry,
        lab,
        Option.exists((place) => place.query.cue !== ''),
      );
      expect(Option.map(value, (place) => place.query.cue)).toEqual(Option.some('elsewhere'));
    }),
  );

  test('on the server a place reads the request, its hash keys at their defaults', () => {
    const { registry } = registryOver(layerServer('/films/f/lab/s?cue=c#t=2'));
    expect(registry.get(lab)).toEqual(
      Option.some({
        path: { film: 'f', scene: 's' },
        query: { cue: 'c', knob: '' },
        hash: { t: 0 },
      }),
    );
  });

  test("a place's server value is its hash at the defaults, on the client too", () => {
    const { registry } = memoryRegistry('/films/f/lab/s?cue=c#t=2');
    // The value a hydration-aware binding renders until hydration ends, so
    // the client's first pass matches the server's markup.
    const hashOf = (value: Option.Option<Place.Type<typeof Lab>>) =>
      Option.map(value, (place) => place.hash.t);
    expect(hashOf(Atom.getServerValue(lab, registry))).toEqual(Option.some(0));
    expect(hashOf(registry.get(lab))).toEqual(Option.some(2));
    expect(Atom.ServerValueTypeId in scene).toBe(false);
  });

  it.effect("a host's own UrlState, seeded with the layer, is the registry's: no second one", () =>
    Effect.gen(function* () {
      // Each UrlState follows its Location's entries for as long as it lives,
      // so the subscriptions to `changes` count the UrlStates built over it.
      let followers = 0;
      const counted = Layer.effect(
        Location,
        Effect.gen(function* () {
          const inner = yield* Location;
          return Location.of({
            ...inner,
            changes: Stream.suspend(() => {
              followers += 1;
              return inner.changes;
            }),
          });
        }),
      ).pipe(Layer.provide(layerMemory('/films/f/lab/s')));
      const host = yield* Layer.build(UrlState.layer.pipe(Layer.provideMerge(counted)));
      yield* Effect.yieldNow;
      expect(followers).toBe(1);

      // Seeded with the layer alone, and as the film seeds it, with the
      // built services too.
      const seeds = [
        [[UrlAtom.layer, Layer.succeedContext(host)]],
        [
          [UrlAtom.layer, Layer.succeedContext(host)],
          [UrlAtom.services, host],
        ],
      ] as const;
      for (const initialValues of seeds) {
        const registry = AtomRegistry.make({ initialValues });
        expect(registry.get(UrlAtom.href)).toBe('/films/f/lab/s');
        yield* Effect.yieldNow;
        registry.dispose();
      }
      expect(followers).toBe(1);
    }).pipe(Effect.scoped),
  );
});
