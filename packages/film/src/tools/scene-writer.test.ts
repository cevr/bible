// The lab's writes on a real file: the value lands, oxfmt runs, and every
// byte outside the edited value is the file's own. What cannot be proven a
// literal is refused with the file untouched, and undo and redo walk a bounded
// stack of writes byte for byte (but never over a change made since).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Context,
  Deferred,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { ContentStore } from './content-store.ts';
import { FilmName, FilmRepo } from './film-repo.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import {
  FORMAT_LIMIT,
  SourceWriter,
  UNDO_DEPTH,
  emptyHistory,
  recordChange,
} from './source-writer.ts';
import { freshCue, sceneFixture } from './testing.ts';

/** The timeout of a test here that spawns (bunx oxfmt, sh, sleep): a cold start's time is the machine's (film/spawn-budget). */
const SPAWNS_MS = 30_000;

/** The fixture's film, by name. */
const F = Schema.decodeSync(FilmName)('f');

/** The fixture's hand scene: a fresh copy per test. */
class HandFile extends Context.Service<HandFile, string>()('test/HandFile') {}

/**
 * The writer over a fresh fixture. `spawning` stands in front of every child
 * process the writer starts, given the hand file: a test uses it to act as an
 * editor saving the file while oxfmt runs, or to make oxfmt fail.
 */
const fixtureWith = (
  spawning: (
    file: string,
    command: ChildProcess.Command,
  ) => Effect.Effect<ChildProcess.Command, never, FileSystem.FileSystem> = (_, command) =>
    Effect.succeed(command),
  registry: Option.Option<string> = Option.none(),
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const real = yield* ChildProcessSpawner.ChildProcessSpawner;
      const films = yield* sceneFixture(yield* fs.makeTempDirectoryScoped());
      const file = path.join(films, 'f', 'scenes', 'hand.ts');
      yield* Effect.forEach(Option.toArray(registry), (text) =>
        fs.writeFileString(path.join(films, 'f', 'scenes', 'index.ts'), text),
      );
      const spawner = ChildProcessSpawner.make((command) =>
        spawning(file, command).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.flatMap(real.spawn),
        ),
      );
      const repo = FilmRepo.layer(films);
      return SceneWriter.layer.pipe(
        Layer.provideMerge(SourceWriter.layer),
        Layer.provideMerge(SceneSources.layer),
        Layer.provide(Layer.merge(repo, freshCue({}).pipe(Layer.provide(repo)))),
        Layer.provide(ContentStore.layer),
        Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
        Layer.merge(Layer.succeed(HandFile, file)),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const fixture = fixtureWith();

/** A registry that overrides the timeline `hand` spreads: the scene reads its own, not hand.ts's. */
const OVERRIDDEN = `import { hand } from './hand.ts';

export const scenes = [
  { id: 'hand', ...hand, timeline: { topple: { mark: 'earns', offset: 5 } } },
];
`;

/** A registry where two scenes spread one drawing: both read hand.ts's literals. */
const SHARED = `import { hand } from './hand.ts';

export const scenes = [
  { id: 'hand', ...hand },
  { id: 'again', ...hand },
];
`;

const keep = (_: string, command: ChildProcess.Command) => Effect.succeed(command);

/** Whether `command` is the writer's oxfmt run. */
const isOxfmt = (command: ChildProcess.Command) =>
  command._tag === 'StandardCommand' && command.args.includes('oxfmt');

/** What an editor saves: its buffer (the file as it was before the lab's write) plus a new line. */
const EDITOR_LINE = '// a line typed in the editor\n';

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
  it.effect(
    'changes one offset: the file differs by that value only, as oxfmt leaves it',
    () =>
      Effect.gen(function* () {
        const before = yield* read();
        // The untouched file is already as oxfmt leaves it: formatting adds nothing of its own.
        expect(yield* oxfmtCheck()).toBe(0);
        const { written } = yield* (yield* SceneWriter).setCue(F, 'hand', 'topple', {
          offset: 0.4,
        });
        const after = yield* read();
        expect(after).toBe(
          before.replace(
            "topple: { mark: 'earns', offset: 0.1,",
            "topple: { mark: 'earns', offset: 0.4,",
          ),
        );
        expect(written).toMatchObject({ film: 'f', target: 'cue topple offset', before, after });
        expect(written.scene).toEqual(Option.some('hand'));
      }).pipe(Effect.provide(fixture)),
    SPAWNS_MS,
  );

  it.effect(
    'adds a missing ease; oxfmt reflows only the span it grew',
    () =>
      Effect.gen(function* () {
        const before = yield* read();
        yield* (yield* SceneWriter).setCue(F, 'hand', 'topple', { ease: 'inQuad', dur: 2.25 });
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
    SPAWNS_MS,
  );

  it.effect('moves a point knob', () =>
    Effect.gen(function* () {
      const before = yield* read();
      yield* (yield* SceneWriter).setKnob(F, 'hand', 'palm', [1010, 760.5]);
      expect(yield* read()).toBe(before.replace('palm: [960, 800]', 'palm: [1010, 760.5]'));
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('refuses a computed value and leaves the file alone', () =>
    Effect.gen(function* () {
      const before = yield* read();
      const error = yield* Effect.flip(
        (yield* SceneWriter).setCue(F, 'hand', 'late', { offset: 1 }),
      );
      expect(error._tag).toBe('SourceRefused');
      expect(error.message).toContain('it is `GAP * 2`, not a literal');
      expect(yield* read()).toBe(before);
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('refuses a timing the timeline cannot resolve and leaves the file alone', () =>
    Effect.gen(function* () {
      const writer = yield* SceneWriter;
      const before = yield* read();
      // topple starts 0.1 s after {earns}: ending at {earns} ends it before it starts.
      const error = yield* Effect.flip(writer.setCue(F, 'hand', 'topple', { until: 'earns' }));
      expect(error._tag).toBe('TimelineUnresolved');
      expect(error.message).toContain('before it starts');
      expect(yield* read()).toBe(before);
      // Starting before the mark, the same end resolves and lands.
      yield* writer.setCue(F, 'hand', 'topple', { offset: -0.5, until: 'earns' });
      expect(yield* read()).toBe(
        before.replace('offset: 0.1, dur: 1.8 }', "offset: -0.5, until: 'earns' }"),
      );
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('undoes the film writes newest first and redoes them, byte for byte', () =>
    Effect.gen(function* () {
      const writer = yield* SceneWriter;
      const source = yield* SourceWriter;
      const targets = Effect.map(source.history('f'), (h) => ({
        undo: Option.map(h.undo, (w) => w.target),
        redo: Option.map(h.redo, (w) => w.target),
        latest: Option.map(h.latest, (w) => w.target),
      }));
      const before = yield* read();
      yield* writer.setCue(F, 'hand', 'topple', { ease: 'outBack' });
      const afterEase = yield* read();
      yield* writer.setKnob(F, 'hand', 'palm', [1, 2]);
      const afterKnob = yield* read();
      expect(yield* targets).toEqual({
        undo: Option.some('knob palm'),
        redo: Option.none(),
        latest: Option.some('knob palm'),
      });
      // Undo twice: the knob, then the ease.
      expect((yield* source.undo('f')).target).toBe('undo knob palm');
      expect(yield* read()).toBe(afterEase);
      expect((yield* source.undo('f')).target).toBe('undo cue topple ease');
      expect(yield* read()).toBe(before);
      // A page reloaded by the undo learns what it did here.
      expect(yield* targets).toEqual({
        undo: Option.none(),
        redo: Option.some('cue topple ease'),
        latest: Option.some('undo cue topple ease'),
      });
      expect((yield* Effect.flip(source.undo('f')))._tag).toBe('UndoUnavailable');
      // Redo twice: the ease, then the knob.
      expect((yield* source.redo('f')).target).toBe('redo cue topple ease');
      expect(yield* read()).toBe(afterEase);
      expect((yield* source.redo('f')).target).toBe('redo knob palm');
      expect(yield* read()).toBe(afterKnob);
      expect((yield* Effect.flip(source.redo('f')))._tag).toBe('RedoUnavailable');
      // A new write after an undo drops what could be redone.
      yield* source.undo('f');
      yield* writer.setKnob(F, 'hand', 'palm', [3, 4]);
      expect((yield* Effect.flip(source.redo('f')))._tag).toBe('RedoUnavailable');
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('neither undo nor redo runs over a change made since', () =>
    Effect.gen(function* () {
      const writer = yield* SceneWriter;
      const source = yield* SourceWriter;
      const fs = yield* FileSystem.FileSystem;
      yield* writer.setKnob(F, 'hand', 'palm', [1, 2]);
      yield* fs.writeFileString(yield* HandFile, `${yield* read()}// edited by hand\n`);
      const edited = yield* read();
      const refused = yield* Effect.flip(source.undo('f'));
      expect(refused.message).toContain('has changed since the lab wrote knob palm');
      expect(yield* read()).toBe(edited);
      // The editor's line taken out again: the undo runs, and the redo is refused over a new one.
      yield* fs.writeFileString(yield* HandFile, edited.replace('// edited by hand\n', ''));
      yield* source.undo('f');
      yield* fs.writeFileString(yield* HandFile, `${yield* read()}// edited by hand\n`);
      const redo = yield* Effect.flip(source.redo('f'));
      expect(redo.message).toContain('has changed since the lab undid knob palm');
    }).pipe(Effect.provide(fixture)),
  );

  it.effect('the undo stack keeps the newest writes, up to its depth', () =>
    Effect.sync(() => {
      const w = (n: number) => ({
        film: 'f',
        scene: Option.some('s'),
        file: 'f.ts',
        target: `knob k${n}`,
        before: `${n - 1}`,
        after: `${n}`,
      });
      let history = emptyHistory;
      for (const n of [1, 2, 3, 4, 5]) history = recordChange(history, w(n), 3);
      expect(history.undos.map((x) => x.target)).toEqual(['knob k3', 'knob k4', 'knob k5']);
      expect(UNDO_DEPTH).toBeGreaterThanOrEqual(20);
    }),
  );

  it.effect('an editor save while oxfmt runs is kept, and the write fails as SourceChanged', () =>
    Effect.gen(function* () {
      const before = yield* read();
      const error = yield* Effect.flip(
        (yield* SceneWriter).setCue(F, 'hand', 'topple', { offset: 0.4 }),
      );
      expect(error._tag).toBe('SourceChanged');
      // The editor's text survives, byte for byte: the lab neither overwrote nor "restored" it.
      expect(yield* read()).toBe(`${before}${EDITOR_LINE}`);
    }).pipe(
      Effect.provide(
        fixtureWith((file, command) =>
          Effect.gen(function* () {
            if (!isOxfmt(command)) return command;
            const fs = yield* FileSystem.FileSystem;
            // The editor's buffer predates the lab's write.
            const buffer = yield* Effect.orDie(fs.readFileString(`${file}.buffer`));
            yield* Effect.orDie(fs.writeFileString(file, `${buffer}${EDITOR_LINE}`));
            return command;
          }),
        ).pipe(
          Layer.tap((context) =>
            Effect.gen(function* () {
              const fs = Context.get(context, FileSystem.FileSystem);
              const file = Context.get(context, HandFile);
              yield* Effect.orDie(fs.copyFile(file, `${file}.buffer`));
            }),
          ),
        ),
      ),
    ),
  );

  it.effect(
    'a failed oxfmt leaves an editor save in place',
    () =>
      Effect.gen(function* () {
        const before = yield* read();
        const error = yield* Effect.flip((yield* SceneWriter).setKnob(F, 'hand', 'palm', [1, 2]));
        expect(error._tag).toBe('FormatFailed');
        expect(yield* read()).toBe(`${before}${EDITOR_LINE}`);
      }).pipe(
        Effect.provide(
          fixtureWith((file, command) =>
            Effect.gen(function* () {
              if (!isOxfmt(command)) return command;
              const fs = yield* FileSystem.FileSystem;
              const now = yield* Effect.orDie(fs.readFileString(file));
              // The editor saves what it had (the file before any write) and oxfmt then fails.
              const buffer = now.replace('palm: [1, 2]', 'palm: [960, 800]');
              yield* Effect.orDie(fs.writeFileString(file, `${buffer}${EDITOR_LINE}`));
              return ChildProcess.make('sh', ['-c', 'exit 3']);
            }),
          ),
        ),
      ),
    SPAWNS_MS,
  );

  /** Done when the hung oxfmt below has started. */
  const hung = Deferred.makeUnsafe<boolean>();

  it.effect(
    'an oxfmt that hangs is stopped at the limit; the write fails, the file untouched',
    () =>
      Effect.gen(function* () {
        const before = yield* read();
        const write = yield* Effect.forkChild(
          (yield* SceneWriter).setCue(F, 'hand', 'topple', { offset: 0.4 }),
        );
        yield* Deferred.await(hung);
        // Let the write's timeout start its (test) clock before the clock moves.
        yield* Effect.repeat(Effect.yieldNow, { times: 50 });
        yield* TestClock.adjust(Duration.sum(FORMAT_LIMIT, Duration.seconds(1)));
        const error = yield* Effect.flip(Fiber.join(write));
        expect(error._tag).toBe('FormatFailed');
        expect(error.message).toContain('did not finish within 20 s');
        expect(yield* read()).toBe(before);
      }).pipe(
        Effect.provide(
          fixtureWith((_, command) =>
            Effect.gen(function* () {
              if (!isOxfmt(command)) return command;
              yield* Deferred.succeed(hung, true);
              return ChildProcess.make('sleep', ['30']);
            }),
          ),
        ),
      ),
    SPAWNS_MS,
  );

  it.effect(
    'a scene that overrides the timeline it spreads: cues are refused, knobs still land',
    () =>
      Effect.gen(function* () {
        const writer = yield* SceneWriter;
        const before = yield* read();
        // hand.ts's topple is not what the scene plays (it plays offset 5): writing it would change nothing.
        const refused = yield* Effect.flip(writer.setCue(F, 'hand', 'topple', { offset: 0.4 }));
        expect(refused._tag).toBe('SceneNotLocated');
        expect(refused.message).toContain('the timeline scene "hand" reads is not the one');
        expect(yield* read()).toBe(before);
        // Its knobs are hand.ts's own object: that literal is the one the scene reads.
        yield* writer.setKnob(F, 'hand', 'palm', [1, 2]);
        expect(yield* read()).toBe(before.replace('palm: [960, 800]', 'palm: [1, 2]'));
      }).pipe(Effect.provide(fixtureWith(keep, Option.some(OVERRIDDEN)))),
  );

  it.effect('two scenes that spread one drawing: its literals are refused, naming both', () =>
    Effect.gen(function* () {
      const writer = yield* SceneWriter;
      const before = yield* read();
      const cue = yield* Effect.flip(writer.setCue(F, 'again', 'topple', { offset: 0.4 }));
      expect(cue._tag).toBe('SourceShared');
      expect(cue.message).toContain('scenes hand, again');
      const knob = yield* Effect.flip(writer.setKnob(F, 'hand', 'palm', [1, 2]));
      expect(knob._tag).toBe('SourceShared');
      expect(yield* read()).toBe(before);
    }).pipe(Effect.provide(fixtureWith(keep, Option.some(SHARED)))),
  );
});
