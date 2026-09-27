import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Option,
  Predicate,
  Schema,
  Sink,
  Stream,
} from 'effect';
import { ChildProcessSpawner } from 'effect/unstable/process';
import { Inspected, riveDocument } from '../core/rive.ts';
import { Rive, linked } from './rive.ts';

/**
 * `rive inspect --json` (rive 1.2.0) of a two-scene project: `seed`, a
 * storyboard `film sync` seeded (marks `fall` and `grow`), and `drawn`, drawn
 * by hand, whose Event `a` its main timeline keys twice and whose `b` only
 * another timeline keys.
 */
const inspected = Effect.gen(function* () {
  const raw = yield* (yield* FileSystem.FileSystem).readFileString(
    `${import.meta.dir}/fixtures/rive-inspect.json`,
  );
  return riveDocument(yield* Schema.decodeEffect(Schema.fromJsonString(Inspected))(raw));
});

describe('the inspected project', () => {
  it.effect.layer(BunServices.layer)(
    'decodes what the CLI prints: every artboard, the fonts, no problems',
    () =>
      Effect.gen(function* () {
        const doc = yield* inspected;
        expect([...doc.boards.keys()]).toEqual(['drawn', 'seed']);
        expect(doc.fonts).toEqual([{ id: '7:1', name: 'Geist' }]);
        expect(doc.problems).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'reads a drawn scene: its main timeline, the Events it fires, its text runs',
    () =>
      Effect.gen(function* () {
        const drawn = Option.getOrThrow(
          Option.fromNullishOr((yield* inspected).boards.get('drawn')),
        );
        expect(drawn.main).toEqual(Option.some({ id: '42:30', fps: 60, frames: 120, seconds: 2 }));
        expect(drawn.events).toEqual([
          { name: 'a', id: '42:20', at: 0.5 },
          { name: 'a', id: '42:20', at: 1.5 },
        ]);
        expect(drawn.unkeyed).toEqual(['b']);
        expect(drawn.runs).toEqual([{ name: 'caption', text: 'Hello' }]);
        expect(drawn.storyboard).toBe(false);
        expect(drawn.component).toBe(false);
        expect([drawn.width, drawn.height, drawn.x]).toEqual([1920, 1080, 2100]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'reads a seeded storyboard as nestable, with an Event per mark',
    () =>
      Effect.gen(function* () {
        const seed = Option.getOrThrow(Option.fromNullishOr((yield* inspected).boards.get('seed')));
        expect(seed.storyboard).toBe(true);
        expect(seed.component).toBe(true);
        expect(seed.events.map((e) => e.name)).toEqual(['fall', 'grow']);
        expect(seed.runs.map((r) => r.name)).toEqual(['beat', 'brief', 'mark fall', 'mark grow']);
      }),
  );
});

describe('linked', () => {
  test('a project is linked once a push records its file', () => {
    expect(linked('name: film\nmain: "Film"\n')).toBe(false);
    expect(linked('name: film\npush:\n  projectId: 9\n  fileId: 512\n')).toBe(true);
    expect(linked('name: film\npush:\n  projectId: 9\n')).toBe(false);
  });
});

/** A `rive` that records each command line and prints a successful build report. */
const recordingRive = (calls: Array<ReadonlyArray<string>>) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        if (Predicate.hasProperty(command, 'args') && Arr.isArray(command.args))
          calls.push(command.args.filter(Predicate.isString));
        const report =
          '{"success":true,"data":{"riv":"/p/build/p.riv","bytes":1},"errors":[],"warnings":[]}';
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(1),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(report)),
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );

describe('Rive.build', () => {
  const calls: Array<ReadonlyArray<string>> = [];
  const layer = Rive.layer.pipe(
    Layer.provide(recordingRive(calls)),
    Layer.provideMerge(BunServices.layer),
  );

  it.effect.layer(layer)(
    'builds offline, and signed once the project holds a script, since the web runtime drops unsigned ones',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* fs.makeTempDirectoryScoped();
          const rive = yield* Rive;
          yield* rive.build(dir);
          yield* fs.makeDirectory(`${dir}/scripts`);
          yield* fs.writeFileString(`${dir}/scripts/torn.luau`, 'return nil');
          yield* rive.build(dir);
          expect(calls.map((args) => args[1])).toEqual(['--once', '--publish']);
        }),
      ),
  );
});
