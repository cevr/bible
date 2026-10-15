// A writer that takes the lock of the manifest its first argument names, says
// `held` on stdout, and holds it until its stdin ends: the other process of a
// test of the store's lock (`content-store.test.ts`). Its stdin is a pipe from
// the test, so it ends when the test ends it or when the test's process is
// gone however it went (a timeout, a signal to the test's process group but not
// to this one's, a SIGKILL): no holder outlives its test.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Schema, Stdio, Stream } from 'effect';
import { ContentStore } from '../content-store.ts';

Stdio.Stdio.use(({ args, stdin }) =>
  Effect.flatMap(args, ([file = '']) =>
    ContentStore.use((store) =>
      store.holding({ file, codec: Schema.String, empty: '' }, () =>
        Effect.andThen(Console.log('held'), Stream.runDrain(stdin)),
      ),
    ),
  ),
).pipe(
  Effect.provide(ContentStore.layer.pipe(Layer.provideMerge(BunServices.layer))),
  BunRuntime.runMain,
);
