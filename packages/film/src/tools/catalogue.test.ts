// RenderCatalogue on disk: the review, a `film project` child per request and
// a terminal's `project render` each write one film's catalogue from their own
// process, and every write lands.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Context, Effect, FileSystem, Layer } from 'effect';
import { comment, partSubject } from '../core/catalogue.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';

/** A catalogue of its own, as another process holds one: nothing in memory is shared. */
const ownCatalogue = Effect.map(
  Layer.build(RenderCatalogue.layer.pipe(Layer.provide(ContentStore.layer))),
  Context.get(RenderCatalogue),
);

describe('RenderCatalogue', () => {
  it.live('two processes commenting on one film at once lose no comment', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const out = yield* fs.makeTempDirectoryScoped();
      const project = { name: 'f', out };
      const film = partSubject({ _tag: 'Film' }, 'main', 'k');
      const [a, b] = [yield* ownCatalogue, yield* ownCatalogue];
      const burst = (catalogues: typeof a, who: string) =>
        Effect.forEach(
          Arr.range(1, 15),
          (i) => catalogues.update(project, (c) => [i, comment(c, film, `${who}${i}`, i)] as const),
          { concurrency: 3 },
        );
      yield* Effect.all([burst(a, 'a'), burst(b, 'b')], { concurrency: 2 });
      const catalogue = yield* (yield* ownCatalogue).read(project);
      expect(catalogue.comments.length).toBe(30);
      expect(new Set(catalogue.comments.map((c) => c.id)).size).toBe(30);
      expect(yield* fs.readDirectory(out)).toEqual(['catalogue.json']);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
