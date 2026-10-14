// A film's mixes and its pages: a mix landing the track a page asked for
// (before its first mix too) wakes that film's pages, and no other film's,
// with no new build; a take's timings saved before the mix wake nothing.
// Where the box's watch is the question (a save, a rename, a folder made)
// the app is in a temp folder; where only what a film's pages hear of a mix
// is, it is in memory, its watches told by the test (`filmsInMemory`, in
// `fixtures/lab-app.ts`).

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Ref } from 'effect';
import { PageBundler } from './lab-page.ts';
import {
  Platform,
  appFolder,
  served,
  buildOf,
  MIXED_AT,
  filmsInMemory,
} from './fixtures/lab-app.ts';

describe("a film's mixes", () => {
  it.live(
    "a mix that lands the track a page was served wakes its wait and builds nothing; the take's timings saved before the mix wake nothing",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        // The test bundler, counted: a page asked again after a mix is not built again.
        const bundles = yield* Ref.make(0);
        const counted = Layer.effect(
          PageBundler,
          Effect.gen(function* () {
            const bundler = yield* PageBundler;
            return PageBundler.of({
              bundle: (entries, root, how) =>
                Effect.andThen(
                  Ref.update(bundles, (n) => n + 1),
                  bundler.bundle(entries, root, how),
                ),
            });
          }),
        ).pipe(Layer.provide(PageBundler.layerTest));
        // Film `f`, its track mixed and its timings.
        const film = path.join(spec.films, 'f');
        const narration = path.join(film, 'narration');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.makeDirectory(narration, { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        yield* fs.writeFileString(path.join(narration, 'full.wav'), 'mix one');
        yield* fs.writeFileString(path.join(narration, 'timings.json'), '{}');
        const { page, ask } = yield* served(spec, counted);
        // The lab's page loads, and plays the film's track.
        yield* ask('/films/f/lab');
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
        const f = { server: Option.none(), film: Option.some('f') };
        // The first build may count once a save it read in the last second: the build once that is heard.
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        // A kept take's timings land before its mix: a page loaded then would play the old track.
        const timed = yield* Effect.andThen(
          fs.writeFileString(path.join(narration, 'timings.json'), '{"voice":""}'),
          page.wait({ since: settled, ...f }, '1 second'),
        );
        expect(timed.build).toBe(settled);
        // The mix lands its track whole, by a rename, as `film mix` does.
        yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix two');
        const mixed = yield* Effect.andThen(
          fs.rename(path.join(narration, 'full.wav.partial'), path.join(narration, 'full.wav')),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        // The page loaded again is stamped past the mix, so its own wait holds, and was not built again.
        const built = yield* Ref.get(bundles);
        expect(buildOf((yield* ask('/films/f/lab')).text)).toBeGreaterThanOrEqual(mixed.build);
        expect(yield* Ref.get(bundles)).toBe(built);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix two');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a film's first mix, with no track and no narration folder when its page loaded, wakes that page's wait",
    () =>
      Effect.gen(function* () {
        const { spec } = yield* appFolder;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        // Film `f` with no take yet: no `narration/` until its first mix makes it.
        const film = path.join(spec.films, 'f');
        yield* fs.makeDirectory(path.join(film, 'scenes'), { recursive: true });
        yield* fs.writeFileString(path.join(film, 'scenes', 'index.ts'), 'export {};\n');
        const { page, ask } = yield* served(spec, PageBundler.layerTest);
        yield* ask('/films/f/lab');
        expect((yield* ask('/films/f/narration/full.wav')).status).toBe(404);
        const f = { server: Option.none(), film: Option.some('f') };
        // The first build may count once a save it read in the last second: the build once that is heard.
        const settled = (yield* page.wait({ since: 0, ...f }, '1 second')).build;
        // The mix makes the folder, writes beside the track and renames, as `film mix` does.
        const narration = path.join(film, 'narration');
        const mixed = yield* Effect.andThen(
          Effect.gen(function* () {
            yield* fs.makeDirectory(narration, { recursive: true });
            yield* fs.writeFileString(path.join(narration, 'full.wav.partial'), 'mix one');
            yield* fs.rename(
              path.join(narration, 'full.wav.partial'),
              path.join(narration, 'full.wav'),
            );
          }),
          page.wait({ since: settled, ...f }, '5 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
        expect((yield* ask('/films/f/narration/full.wav')).text).toBe('mix one');
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live("one film's mix wakes its own page's wait, never another film's", () =>
    Effect.gen(function* () {
      const { page, ask, mix, armed } = yield* filmsInMemory;
      // Films `f` and `g`, each played by a page.
      for (const name of ['f', 'g']) {
        yield* ask(`/films/${name}/lab`);
        expect((yield* ask(`/films/${name}/narration/full.wav`)).text).toBe(`${name} one`);
        yield* armed(name);
      }
      const of = (name: string) => ({ server: Option.none(), film: Option.some(name) });
      const settled = (yield* page.wait({ since: 0, ...of('f') }, 0)).build;
      const forG = yield* Effect.andThen(
        mix('g', 'g two'),
        page.wait({ since: settled, ...of('g') }, '2 seconds'),
      );
      expect(forG.build).toBeGreaterThan(settled);
      // F's page, stamped before g's mix, which is counted by now, hears nothing newer.
      expect((yield* page.wait({ since: settled, ...of('f') }, 0)).build).toBe(settled);
    }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a write's own mix is named by the build its film's pages hear it at, counted at once if no watch has; a later mix is a later build, and the earlier keeps its own",
    () =>
      Effect.gen(function* () {
        const { page, ask, land, mix } = yield* filmsInMemory;
        // No page has asked for the track: no mix of it is heard.
        expect(yield* page.heardAt('f', MIXED_AT)).toEqual(Option.none());
        yield* ask('/films/f/lab');
        yield* ask('/films/f/narration/full.wav');
        const f = { server: Option.none(), film: Option.some('f') };
        const settled = (yield* page.wait({ since: 0, ...f }, 0)).build;
        // The track as it was when asked for was never counted as a mix.
        expect(yield* page.heardAt('f', MIXED_AT)).toEqual(Option.none());
        // A write asks at once after its mix, which no watch has heard.
        const two = yield* land('f', 'mix two');
        const ownTwo = yield* page.heardAt('f', two);
        expect(Option.map(ownTwo, (b) => b.build > settled)).toEqual(Option.some(true));
        // The page waiting hears that very build: nothing else changed since.
        const heard = yield* page.wait({ since: settled, ...f }, '2 seconds');
        expect(Option.some(heard)).toEqual(ownTwo);
        // A later mix is a later build; the earlier mix keeps its own, not the track's now.
        const three = yield* mix('f', 'mix three');
        const ownThree = yield* page.heardAt('f', three);
        expect(
          Option.exists(ownThree, (b) => Option.exists(ownTwo, (a) => b.build > a.build)),
        ).toBe(true);
        expect(yield* page.heardAt('f', two)).toEqual(ownTwo);
        // Another film's page asked for nothing: none.
        expect(yield* page.heardAt('g', three)).toEqual(Option.none());
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );

  it.live(
    "a page that waits with its film hears the film's mix, though it never played the track",
    () =>
      Effect.gen(function* () {
        // A review tab of f's choices: its page loads, its track is never asked for.
        const { page, ask, mix, armed } = yield* filmsInMemory;
        yield* ask('/films/f/choices');
        const f = { server: Option.none(), film: Option.some('f') };
        // Its first wait arms the track's watch.
        const settled = (yield* page.wait({ since: 0, ...f }, 0)).build;
        yield* armed('f');
        const mixed = yield* Effect.andThen(
          mix('f', 'mix two'),
          page.wait({ since: settled, ...f }, '2 seconds'),
        );
        expect(mixed.build).toBeGreaterThan(settled);
      }).pipe(Effect.scoped, Effect.provide(Platform)),
  );
});
