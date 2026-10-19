// `runFillPicks`: the owner's picks filed onto each decision on an app's
// productions' ledgers that names its ask and carries none, from the ask's
// record in the app's lab (`ask-store.ts` `fillPicks`), for the app's own
// script to run (`bun run fill-picks`). It prints a line per such decision,
// filled or left and why, then how many of each. The app names its folders,
// as it does for the `film` CLI (`runFilmCli`); FILMS_PRODUCTIONS and
// FILMS_LAB, when set, win.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { ConfigProvider, Console, Effect, Layer, Match } from 'effect';
import { type PicksFound, fillPicks } from './ask-store.ts';
import { ContentStore } from './content-store.ts';
import { ProductionStore } from './production-store.ts';

/** A decision's line: its production, its ask, and the picks filed on it, or why none. */
const lineOf = (production: string, found: PicksFound): string =>
  Match.value(found).pipe(
    Match.tagsExhaustive({
      Filled: ({ ask, picks }) =>
        `fill-picks ${production} ${ask} filled ${Object.entries(picks)
          .map(([question, value]) => `${question}=${value}`)
          .join(' ')}`,
      Left: ({ ask, why }) => `fill-picks ${production} ${ask} left: ${why}`,
    }),
  );

/** Run the fill over the app's ledgers (`productions`) and its lab's asks (`lab`), a line each. */
export const runFillPicks = (folders: {
  readonly lab: string;
  readonly productions: string;
}): void => {
  const Platform = BunServices.layer;
  // The app's folders under the environment's: FILMS_LAB and FILMS_PRODUCTIONS, when set, win.
  const Folders = ConfigProvider.layerAdd(
    ConfigProvider.fromUnknown({ FILMS_LAB: folders.lab, FILMS_PRODUCTIONS: folders.productions }),
  );
  const Store = ContentStore.layer.pipe(Layer.provide(Platform));
  const Stores = Layer.mergeAll(
    ProductionStore.layer.pipe(Layer.provide([Store, Platform])),
    Store,
    Platform,
  ).pipe(Layer.provideMerge(Folders));
  Effect.gen(function* () {
    const found = yield* fillPicks;
    yield* Effect.forEach(found, ({ production, found: f }) => Console.log(lineOf(production, f)));
    const filled = found.filter(({ found: f }) => f._tag === 'Filled').length;
    yield* Console.log(`fill-picks filled=${filled} left=${found.length - filled}`);
  }).pipe(Effect.provide(Stores), BunRuntime.runMain);
};
