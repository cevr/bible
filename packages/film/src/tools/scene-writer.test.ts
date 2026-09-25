// The lab's writes on a real file: the value lands, oxfmt runs, and every
// byte outside the edited value is the file's own. What cannot be proven a
// literal is refused with the file untouched, and one undo puts the file back
// byte for byte (but not over a change made since).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { ContentStore } from './content-store.ts';
import { FilmRepo } from './film-repo.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { sceneFixture } from './testing.ts';

/** The fixture's hand scene: a fresh copy per test. */
class HandFile extends Context.Service<HandFile, string>()('test/HandFile') {}

const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
    return SceneWriter.layer.pipe(
      Layer.provideMerge(SceneSources.layer),
      Layer.provide(FilmRepo.layer(films)),
      Layer.provide(ContentStore.layer),
      Layer.merge(Layer.succeed(HandFile, path.join(films, 'f', 'scenes', 'hand.ts'))),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

const read = Effect.fn('test.read')(function* () {
  return yield* (yield* FileSystem.FileSystem).readFileString(yield* HandFile);
});

/** oxfmt's verdict on the file: 0 when it would change nothing. */
const oxfmtCheck = Effect.fn('test.oxfmtCheck')(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return Number(
    yield* spawner.exitCode(ChildProcess.make('bunx', ['oxfmt', '--check', yield* HandFile])),
  );
});

describe('scene writer', () => {
  it.effect('changes one offset: the file differs by that value only, as oxfmt leaves it', () =>
    Effect.gen(function* () {
      const before = yield* read();
      // The untouched file is already as oxfmt leaves it: formatting adds nothing of its own.
      expect(yield* oxfmtCheck()).toBe(0);
      const written = yield* (yield* SceneWriter).setCue('f', 'hand', 'topple', { offset: 0.4 });
      const after = yield* read();
      expect(after).toBe(
        before.replace(
          "topple: { mark: 'earns', offset: 0.1,",
          "topple: { mark: 'earns', offset: 0.4,",
        ),
      );
      expect(written).toMatchObject({ scene: 'hand', target: 'cue topple offset', before, after });
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('adds a missing ease; oxfmt reflows only the span it grew', () =>
    Effect.gen(function* () {
      const before = yield* read();
      yield* (yield* SceneWriter).setCue('f', 'hand', 'topple', { ease: 'inQuad', dur: 2.25 });
      const after = yield* read();
      const line = "    topple: { mark: 'earns', offset: 0.1, dur: 1.8 },\n";
      const at = before.indexOf(line);
      expect(after.slice(0, at)).toBe(before.slice(0, at));
      expect(after.slice(after.indexOf('    late: {'))).toBe(
        before.slice(before.indexOf('    late: {')),
      );
      expect(after.slice(at, after.indexOf('    late: {'))).toBe(
        "    topple: { mark: 'earns', offset: 0.1, dur: 2.25, ease: 'inQuad' },\n",
      );
      expect(yield* oxfmtCheck()).toBe(0);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('moves a point knob', () =>
    Effect.gen(function* () {
      const before = yield* read();
      yield* (yield* SceneWriter).setKnob('f', 'hand', 'palm', [1010, 760.5]);
      expect(yield* read()).toBe(before.replace('palm: [960, 800]', 'palm: [1010, 760.5]'));
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('refuses a computed value and leaves the file alone', () =>
    Effect.gen(function* () {
      const before = yield* read();
      const error = yield* Effect.flip(
        (yield* SceneWriter).setCue('f', 'hand', 'late', { offset: 1 }),
      );
      expect(error._tag).toBe('SourceRefused');
      expect(error.message).toContain('it is `GAP * 2`, not a literal');
      expect(yield* read()).toBe(before);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('undoes the last write byte for byte, once, and not over a later change', () =>
    Effect.gen(function* () {
      const writer = yield* SceneWriter;
      const fs = yield* FileSystem.FileSystem;
      const before = yield* read();
      yield* writer.setCue('f', 'hand', 'topple', { ease: 'outBack' });
      expect(Option.map(yield* writer.last, (w) => w.target)).toEqual(
        Option.some('cue topple ease'),
      );
      const undone = yield* writer.undo;
      expect(Option.isNone(yield* writer.last)).toBe(true);
      expect(yield* read()).toBe(before);
      expect(undone.target).toBe('undo cue topple ease');
      expect((yield* Effect.flip(writer.undo))._tag).toBe('UndoUnavailable');
      yield* writer.setKnob('f', 'hand', 'palm', [1, 2]);
      yield* fs.writeFileString(yield* HandFile, `${yield* read()}// edited by hand\n`);
      const refused = yield* Effect.flip(writer.undo);
      expect(refused.message).toContain('has changed since the lab wrote knob palm');
    }).pipe(Effect.provide(fixture)),
  );
});
