// A writer that takes the lock of the manifest its first argument names, says
// `held` on stdout, and holds it until it is killed: the other process of a
// test of the store's lock (`content-store.test.ts`).

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Schema, Stdio } from 'effect';
import { ContentStore } from '../content-store.ts';

Stdio.Stdio.use(({ args }) =>
  Effect.flatMap(args, ([file = '']) =>
    ContentStore.use((store) =>
      store.holding({ file, codec: Schema.String, empty: '' }, () =>
        Effect.andThen(Console.log('held'), Effect.never),
      ),
    ),
  ),
).pipe(
  Effect.provide(ContentStore.layer.pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain,
);
