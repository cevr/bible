import { test } from 'bun:test';
import { Context, Effect, Layer, Option, Scope } from 'effect';
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

const start: Codec.MediaTime = { _tag: 'Point', at: 0 };

const Lab = Place.make({
  path: '/films/:film/lab/:scene',
  params: { film: Codec.Segment, scene: Codec.Segment },
  query: Field.struct({
    cue: Field.key(Codec.Text, { default: '', history: 'push' }),
    knob: Field.key(Codec.Text, { default: '' }),
  }),
  hash: Field.struct({ t: Field.key(Codec.MediaTime, { default: start }) }),
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
  const history = Context.get(context, LocationHistory);
  const stack = history.entries.pipe(
    Effect.map(({ stack }) => stack.map((entry) => `${entry.navigation} ${entry.href}`)),
  );
  return { registry, history, stack, location: Context.get(context, Location) };
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
        hash: { t: { _tag: 'Point', at: 2 } },
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
      const { registry, history } = memoryRegistry('/films/f/lab/s');
      const unmount = registry.mount(lab);
      registry.set(lab, { ...labOf(registry), query: { ...labOf(registry).query, cue: 'c' } });
      const pushed = yield* until(registry, UrlAtom.entry, (entry) => entry.navigation === 'push');
      yield* history.back;
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
        hash: { t: start },
      }),
    );
  });

  test("a place's server value is its hash at the defaults, on the client too", () => {
    const { registry } = memoryRegistry('/films/f/lab/s?cue=c#t=2');
    // The value a hydration-aware binding renders until hydration ends, so
    // the client's first pass matches the server's markup.
    const hashOf = (value: Option.Option<Place.Type<typeof Lab>>) =>
      Option.map(value, (place) => place.hash.t);
    expect(hashOf(Atom.getServerValue(lab, registry))).toEqual(Option.some(start));
    expect(hashOf(registry.get(lab))).toEqual(Option.some({ _tag: 'Point', at: 2 }));
    expect(Atom.ServerValueTypeId in scene).toBe(false);
  });
});
