// RenderCatalogue on disk: the review, a `film project` child per request and
// a terminal's `project render` each write one film's catalogue from their own
// process, and every write lands.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Context, Effect, FileSystem, Layer, Result } from 'effect';
import { sceneAddress } from '../core/address.ts';
import { approvalState, comment, emptyCatalogue, partSubject, said } from '../core/catalogue.ts';
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

  it.live(
    "a change that refuses writes nothing, its refusal as it was; a catalogue that will not read is the catalogue's",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const out = yield* fs.makeTempDirectoryScoped();
        const project = { name: 'f', out };
        const file = `${out}/catalogue.json`;
        const catalogues = yield* ownCatalogue;
        yield* catalogues.update(project, (c) => [0, c] as const);
        yield* fs.writeFileString(file, `  ${yield* fs.readFileString(file)}\n`);
        const before = yield* fs.readFileString(file);
        const refused = yield* Effect.flip(
          catalogues.attempt(project, () => Result.fail('no' as const)),
        );
        expect(refused).toBe('no');
        expect(yield* fs.readFileString(file)).toBe(before);
        yield* fs.writeFileString(file, 'not json');
        const unread = yield* Effect.flip(
          catalogues.attempt(project, (c) => Result.succeed([0, c] as const)),
        );
        expect(unread).toMatchObject({ _tag: 'CatalogueInvalid' });
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});

describe('said', () => {
  test('withdraws every approval of the variant, whatever version, and no other', () => {
    const now = partSubject(sceneAddress('open'), 'main', 'k2');
    const earlier = { ...now, key: 'k1' };
    const other = partSubject(sceneAddress('close'), 'main', 'k2');
    const approved = [earlier, now, other].reduce(
      (cat, subject) => said(cat, subject, { _tag: 'Approve' }, 1),
      emptyCatalogue('f'),
    );
    expect(approvalState(approved, now)).toBe('approved');
    const withdrawn = said(approved, now, { _tag: 'Withdraw' }, 2);
    expect(approvalState(withdrawn, now)).toBe('none');
    expect(approvalState(withdrawn, earlier)).toBe('none');
    expect(approvalState(withdrawn, other)).toBe('approved');
    const commented = said(withdrawn, now, { _tag: 'Comment', text: 'late' }, 3);
    expect(commented.comments.map((c) => [c.text, c.key])).toEqual([['late', 'k2']]);
  });
});
