// The host's moves of the address bar: a reload loads the page at the place
// its URL keeps, a write made the moment before among it (`UrlState`
// flushes a tick's writes after the tick, so a reload that did not wait
// would load the place before); and each move is named by its cause, the
// place's declaration saying which is a step Back walks.

import { Location, UrlState } from '@bible/url-state';
import { layerMemory } from '@bible/url-state/testing';
import { Effect, Fiber, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { PageLoad } from './page-load.ts';
import { addressOn, hostOf, reloadAtAddress } from './host.ts';

describe('the address bar', () => {
  it.live('a reload loads the page at the place written the moment before', () => {
    const loaded: Array<string> = [];
    const address = UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/lab/one#t=0')));
    const pageLoad = Layer.effect(
      PageLoad,
      Effect.gen(function* () {
        const bar = yield* Location;
        return PageLoad.of({
          reload: Effect.map(bar.current, (entry) => {
            loaded.push(entry.href);
          }),
          open: () => Effect.void,
        });
      }),
    ).pipe(Layer.provideMerge(address));
    return Effect.gen(function* () {
      const url = yield* UrlState.UrlState;
      yield* url.navigate('/films/p/lab/two#t=1.5', {
        history: 'replace',
        throttle: Option.none(),
      });
      yield* reloadAtAddress;
      expect(loaded).toEqual(['/films/p/lab/two#t=1.5']);
    }).pipe(Effect.provide(pageLoad));
  });

  it.live(
    "a viewer's move is a step where its place declares one; the URL following the page never is",
    () => {
      const host = hostOf(UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/lab/one'))));
      const address = addressOn(host);
      /** The entry `moves` (one tick's writes) commit, as `<navigation> <href>`. */
      const entryOf = (moves: () => void) =>
        Effect.gen(function* () {
          const next = yield* Location.use((bar) =>
            bar.changes.pipe(
              Stream.drop(1),
              Stream.map((entry) => `${entry.navigation} ${entry.href}`),
              Stream.runHead,
              Effect.forkChild({ startImmediately: true }),
            ),
          );
          moves();
          return Option.getOrElse(yield* Fiber.join(next), () => 'none');
        });
      return Effect.gen(function* () {
        // The time alone, on the viewer's move or the page's: no step.
        expect(yield* entryOf(() => address.go('/films/p/lab/one#t=1'))).toBe(
          'replace /films/p/lab/one#t=1',
        );
        expect(yield* entryOf(() => address.follow('/films/p/lab/one#t=2'))).toBe(
          'replace /films/p/lab/one#t=2',
        );
        // A cue picked and the compare's mode picked: cited keys, each a step.
        expect(yield* entryOf(() => address.go('/films/p/lab/one?cue=rise#t=2'))).toBe(
          'push /films/p/lab/one?cue=rise#t=2',
        );
        expect(yield* entryOf(() => address.go('/films/p/lab/one?cue=rise&view=wipe#t=2'))).toBe(
          'push /films/p/lab/one?cue=rise&view=wipe#t=2',
        );
        // The compare's own move: written in place.
        expect(
          yield* entryOf(() => address.follow('/films/p/lab/one?cue=rise&view=blink#t=2')),
        ).toBe('replace /films/p/lab/one?cue=rise&view=blink#t=2');
        // Play crosses into the next scene: in place; a jump to the next: a step.
        expect(yield* entryOf(() => address.follow('/films/p/lab/two#t=0'))).toBe(
          'replace /films/p/lab/two#t=0',
        );
        expect(yield* entryOf(() => address.go('/films/p/lab/three#t=0'))).toBe(
          'push /films/p/lab/three#t=0',
        );
        // A play write and a jump in one tick are one step, judged from the entry on screen.
        expect(
          yield* entryOf(() => {
            address.follow('/films/p/lab/one#t=0');
            address.go('/films/p/lab/one#t=0.5');
          }),
        ).toBe('push /films/p/lab/one#t=0.5');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );
});
