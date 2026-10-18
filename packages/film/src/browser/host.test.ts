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

describe('the address bar', () => {
  it.live('a reload loads the page at the place written the moment before', () => {
    const loaded: Array<string> = [];
    const address = UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/studio#t=0')));
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
      yield* url.navigate('/films/q/studio#t=1.5', {
        history: 'replace',
        throttle: Option.none(),
      });
      yield* reloadAtAddress;
      expect(loaded).toEqual(['/films/q/studio#t=1.5']);
    }).pipe(Effect.provide(pageLoad));
  });

  it.live(
    "a viewer's move is a step where its place declares one; the URL following the page never is",
    () => {
      const host = hostOf(UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/studio'))));
      const address = addressOn(host);
      return Effect.gen(function* () {
        // The time alone, on the viewer's move or the page's: no step.
        expect(yield* entryOf(() => address.go('/films/p/studio#t=1'))).toBe(
          'replace /films/p/studio#t=1',
        );
        expect(yield* entryOf(() => address.follow('/films/p/studio#t=2'))).toBe(
          'replace /films/p/studio#t=2',
        );
        // A beat selected and a note opened: cited keys, each a step.
        expect(yield* entryOf(() => address.go('/films/p/studio?sel=rise#t=2'))).toBe(
          'push /films/p/studio?sel=rise#t=2',
        );
        expect(yield* entryOf(() => address.go('/films/p/studio?sel=rise&note=n1#t=2'))).toBe(
          'push /films/p/studio?sel=rise&note=n1#t=2',
        );
        // The page following its own selection: written in place.
        expect(yield* entryOf(() => address.follow('/films/p/studio?sel=fall#t=3'))).toBe(
          'replace /films/p/studio?sel=fall#t=3',
        );
        // Another film's studio: a step.
        expect(yield* entryOf(() => address.go('/films/q/studio#t=0'))).toBe(
          'push /films/q/studio#t=0',
        );
        // A play write and a jump in one tick are one step, judged from the entry on screen.
        expect(
          yield* entryOf(() => {
            address.follow('/films/p/studio#t=0');
            address.go('/films/p/studio#t=0.5');
          }),
        ).toBe('push /films/p/studio#t=0.5');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );

  it.live(
    'a dismissal goes Back over the entry its opening pushed only when Back lands where it would write',
    () => {
      const host = hostOf(
        UrlState.layer.pipe(Layer.provideMerge(layerMemory('/films/p/lab/one?view=wipe&size=2'))),
      );
      const address = addressOn(host);
      /** Open a sheet with a step (`go`): the entry it pushed, and the href of the entry it left. */
      const open = (to: string) =>
        Effect.gen(function* () {
          const before = (yield* Location.use((bar) => bar.current)).href;
          yield* entryOf(() => address.go(to));
          const { key } = yield* Location.use((bar) => bar.current);
          return Option.some({ key, before });
        });
      return Effect.gen(function* () {
        // Back lands exactly where the Close writes (its query in any order): Back.
        const first = yield* open('/films/p/lab/one?view=wipe&size=2&cue=rise');
        expect(
          yield* entryOf(() =>
            address.dismiss(first, Option.some('/films/p/lab/one?size=2&view=wipe')),
          ),
        ).toBe('traverse /films/p/lab/one?view=wipe&size=2');
        // Time moved while the sheet was open: Back would rewind it, so the entry is rewritten.
        const second = yield* open('/films/p/lab/one?cue=rise');
        yield* entryOf(() => address.follow('/films/p/lab/one?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(second, Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        // An entry the page did not push (a link's, a reload's): rewritten, never Back.
        yield* entryOf(() => address.go('/films/p/lab/one?cue=fall#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(Option.none(), Option.some('/films/p/lab/one#t=2'))),
        ).toBe('replace /films/p/lab/one#t=2');
        // The pushed entry is no longer on screen (another step since): rewritten.
        const third = yield* open('/films/p/lab/one?cue=rise#t=2');
        yield* entryOf(() => address.go('/films/p/lab/two?cue=rise#t=2'));
        expect(
          yield* entryOf(() => address.dismiss(third, Option.some('/films/p/lab/two#t=2'))),
        ).toBe('replace /films/p/lab/two#t=2');
      }).pipe(Effect.provide(Layer.succeedContext(host)));
    },
  );
});
