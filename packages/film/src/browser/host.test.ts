// The host's moves of the address bar: a reload loads the page at the place
// its URL keeps, a write made the moment before among it (`UrlState`
// flushes a tick's writes after the tick, so a reload that did not wait
// would load the place before).

import { Location, UrlState, layerMemory } from '@bible/url-state';
import { Effect, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { PageLoad } from './page-load.ts';
import { reloadAtAddress } from './host.ts';

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
});
