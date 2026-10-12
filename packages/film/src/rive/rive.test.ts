// The Rive engine on the fixture rig (`canvas/fixtures/arm.ts`), in Bun with no
// browser: the Bun layer loads the runtime and the rig and leaves no global
// behind; a frame is posed from rest, whatever was posed before it; every
// path is made afresh each frame, so the paths Rive's Canvas 2D renderer
// draws after any history are a new rig's, number for number, and a boil
// keyed on the fresh timeline's point still has the last word; and a
// declaration that names what the rig lacks (or a fresh timeline that loops,
// or that a pose names) fails the load, listing what it has, with nothing
// stood on the film.

import canvasWasm from '@rive-app/canvas-advanced/rive.wasm' with { type: 'file' };
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, FileSystem, Layer, Option, Schema, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import { recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import { type LoadedRig, type RiveEngine, type RivePropSpec, drawRig } from '../canvas/rive.ts';
import { RigNameMissing, RigUnloadable } from '../core/errors.ts';
import { type ArmPose, armFilm, armPose, armRig, armScene } from '../canvas/fixtures/arm.ts';
import { loadRigs } from './load.ts';
import { RiveRuntime } from './runtime.ts';
import { RiveRuntimeBun } from './runtime-bun.ts';

/**
 * A `Path2D` that writes its commands down, so two drawings compare number
 * for number: what Rive's Canvas 2D renderer builds each path into.
 */
class WrittenPath {
  readonly ops: string[] = [];
  moveTo(x: number, y: number) {
    this.ops.push(`M${x},${y}`);
  }
  lineTo(x: number, y: number) {
    this.ops.push(`L${x},${y}`);
  }
  bezierCurveTo(...xy: ReadonlyArray<number>) {
    this.ops.push(`C${xy.join(',')}`);
  }
  closePath() {
    this.ops.push('Z');
  }
  addPath(path: WrittenPath, m: DOMMatrix2DInit) {
    this.ops.push(`P${[m.a, m.b, m.c, m.d, m.e, m.f].join(',')}`, ...path.ops);
  }
}

/** The matrix `addPath` is handed: its six numbers, as Rive sets them. */
class DOMMatrix2D {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
}

/** The class `name` set on the global object for the scope, put back (or deleted) when it closes. */
const globalFor = <A>(name: 'Path2D' | 'DOMMatrix', value: A) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const before = { had: Reflect.has(globalThis, name), value: Reflect.get(globalThis, name) };
      Reflect.set(globalThis, name, value);
      return before;
    }),
    (before) =>
      Effect.sync(() => {
        if (before.had) Reflect.set(globalThis, name, before.value);
        else Reflect.deleteProperty(globalThis, name);
      }),
  );

/**
 * Rive's Canvas 2D runtime in Bun: the stand-in document, a `Path2D` that
 * writes its commands down and a `DOMMatrix` stand for the layer's scope.
 * Every engine is this one, and it paints (`writtenContext`).
 */
const RiveRuntimePainted = Layer.effect(
  RiveRuntime,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* standInDom({ record: false });
    yield* globalFor('Path2D', WrittenPath);
    yield* globalFor('DOMMatrix', DOMMatrix2D);
    const wasm = yield* Effect.orDie(fs.readFile(canvasWasm));
    const module = yield* Effect.promise(() => import('@rive-app/canvas-advanced'));
    const runtime = yield* Effect.promise(() =>
      module.default({ wasmBinary: new Uint8Array(wasm).buffer, locateFile: () => canvasWasm }),
    );
    return RiveRuntime.of({
      runtime: () => Effect.succeed(runtime),
      read: (riv) =>
        Effect.mapError(fs.readFile(riv), (error) =>
          RigUnloadable.make({ rig: riv, reason: error.message }),
        ),
      paints: true,
    });
  }),
).pipe(Layer.provide(BunFileSystem.layer));

/** `film` with its rigs' stand recorded: the loaded rigs, as the loader hands them to the film. */
const watched = (film: Film) => {
  const stood: Array<ReadonlyMap<RivePropSpec, LoadedRig>> = [];
  const seen: Film = {
    ...film,
    rigs: {
      declared: film.rigs.declared,
      stand: (loaded) => {
        stood.push(loaded);
        return film.rigs.stand(loaded);
      },
    },
  };
  return { film: seen, stood };
};

/** The fixture rig drawn by `engine`, loaded in a scope of its own: the spec, the loaded rig, and the scope to close. */
const armLoaded = (engine: RiveEngine) =>
  Effect.gen(function* () {
    const spec = armRig(engine);
    const { film, stood } = watched(
      armFilm([{ id: 'arm', min: 4, rigs: { arm: spec }, draw: () => {} }]),
    );
    const scope = yield* Scope.make();
    yield* Scope.provide(loadRigs(film), scope);
    const rig = yield* Effect.fromOption(Option.fromNullishOr(stood[0]?.get(spec)));
    return { spec, rig, scope };
  });

/** The fixture rig loaded by the Bun layer, which poses and draws nothing. */
const loadedArm = armLoaded('webgl2').pipe(Effect.provide(RiveRuntimeBun));

/**
 * A 2D context that writes down each path filled, clipped or stroked and
 * each transform set, as text, and answers nothing else. Not the stand-in:
 * Rive's Canvas 2D renderer passes through any method its context has, and
 * the stand-in has every one.
 */
const writtenContext = (written: string[]): CanvasRenderingContext2D => {
  const quiet = () => {};
  const paths = (kind: string) => (path: WrittenPath) => {
    written.push(`${kind} ${path.ops.join(' ')}`);
  };
  const ctx: CanvasRenderingContext2D = Schema.decodeSync(Schema.Any)({
    canvas: { width: 200, height: 200, getContext: () => ctx },
    save: quiet,
    restore: quiet,
    translate: quiet,
    resetTransform: quiet,
    setTransform: quiet,
    transform: (...m: ReadonlyArray<number>) => written.push(`transform ${m.join(',')}`),
    fill: paths('fill'),
    stroke: paths('stroke'),
    clip: paths('clip'),
    drawImage: quiet,
  });
  return ctx;
};

/**
 * The paths Rive's Canvas 2D renderer fills (and clips, and strokes) for
 * `rig` posed to `p`, each after the transform it was set under, as text.
 */
const drawnPaths = (spec: RivePropSpec, rig: LoadedRig, p: ArmPose) => {
  const written: string[] = [];
  expect(drawRig(writtenContext(written), spec, rig, p)).toBeUndefined();
  return written.join('\n');
};

/** How far right of its own origin each path filled reaches: the greatest x of its points, in draw order. */
const reaches = (drawn: string) =>
  [...drawn.matchAll(/^fill (.*)$/gm)].map((line) =>
    Math.max(
      ...(line[1] ?? '')
        .split(' ')
        .filter((command) => command.length > 1)
        .flatMap((command) =>
          command
            .slice(1)
            .split(',')
            .map(Number)
            .filter((_, i) => i % 2 === 0),
        ),
    ),
  );

/** Every bone's world transform and the face node's, as the bytes of their numbers: equal only when bit-identical. */
const worldOf = (rig: LoadedRig) => {
  const values: number[] = [];
  for (const node of [rig.artboard.bone('upper'), rig.artboard.bone('lower'), rig.face]) {
    for (const m of Option.toArray(Option.fromNullishOr(node?.worldTransform()))) {
      values.push(m.xx, m.xy, m.yx, m.yy, m.tx, m.ty);
      m.delete();
    }
  }
  expect(values.length).toBe(18);
  return Buffer.from(new Float64Array(values).buffer).toString('hex');
};

/** Pose `rig` to `pose` (Bun draws nothing: the pose and the face). */
const pose = (spec: RivePropSpec, rig: LoadedRig, p: ArmPose) =>
  expect(drawRig(recorder(200, 200, { record: false }).ctx, spec, rig, p)).toBeUndefined();

/** Two histories: one reaching far with the IK full on, one lifted and slack. */
const HISTORY_A: ReadonlyArray<ArmPose> = [
  { timelines: [['reach', 1.9]], numbers: { reach: 1, lift: 20 } },
  {
    timelines: [
      ['reach', 0.2],
      ['idle', 0.5],
    ],
    numbers: { reach: 1, lift: 190 },
  },
];
const HISTORY_B: ReadonlyArray<ArmPose> = [
  { timelines: [['reach', 1.2, 0.5]], numbers: { reach: 0.1, lift: 40 } },
  armPose(3.3),
  { timelines: [['reach', 0.7]], numbers: { lift: 100 } },
];

/** The five poses compared: the reach off, on, mid-mix and left at rest. */
const TARGETS = [0.1, 0.6, 1.1, 1.6, 1.95].map(armPose);

/** How many times the shuffled history visits, over the arm's four seconds. */
const SHUFFLED = 60;

describe('the Rive engine', () => {
  it.effect('loads the runtime and the rig in Bun, and leaves no document behind', () =>
    Effect.gen(function* () {
      const had = Reflect.has(globalThis, 'document');
      const before: unknown = Reflect.get(globalThis, 'document');
      const { spec, rig, scope } = yield* loadedArm;
      expect(rig.paints).toBe(false);
      expect([...rig.timelines.keys()]).toEqual(['idle', 'reach', 'boil']);
      // The rest is every timeline but the fresh one.
      expect(rig.rest.length).toBe(3);
      expect(rig.numbers.map((n) => [n.name, n.rest])).toEqual([
        ['lift', 160],
        ['reach', expect.closeTo(0.6, 6)],
      ]);
      pose(spec, rig, armPose(0.6));
      yield* Scope.close(scope, Exit.void);
      expect(Reflect.has(globalThis, 'document')).toBe(had);
      expect(Object.is(Reflect.get(globalThis, 'document'), before)).toBe(true);
    }),
  );

  it.effect('stands the rigs on the film for its scope, and two films never share one', () =>
    Effect.gen(function* () {
      yield* standInDom({ record: false });
      const film = armFilm([armScene('arm', 'webgl2')]);
      const scope = yield* Scope.make();
      const one = watched(film);
      const two = watched(armFilm([armScene('arm', 'webgl2')]));
      yield* Scope.provide(loadRigs(one.film), scope);
      yield* Scope.provide(loadRigs(two.film), scope);
      const [rigOne] = [...(one.stood[0]?.values() ?? [])];
      const [rigTwo] = [...(two.stood[0]?.values() ?? [])];
      expect(rigOne).toBeDefined();
      expect(rigOne).not.toBe(rigTwo);
      expect(rigOne?.artboard).not.toBe(rigTwo?.artboard);
      // Drawn while it stands; refused, naming the loader, once its scope has closed.
      film.render(recorder().ctx, 1);
      yield* Scope.close(scope, Exit.void);
      expect(() => film.render(recorder().ctx, 1)).toThrow(/not loaded/);
    }).pipe(Effect.provide(RiveRuntimeBun), Effect.scoped),
  );

  it.effect(
    'poses every frame from rest: bit-identical after either history and on a fresh rig',
    () =>
      Effect.gen(function* () {
        const a = yield* loadedArm;
        const b = yield* loadedArm;
        for (const target of TARGETS) {
          for (const p of HISTORY_A) pose(a.spec, a.rig, p);
          pose(a.spec, a.rig, target);
          for (const p of HISTORY_B) pose(b.spec, b.rig, p);
          pose(b.spec, b.rig, target);
          const fresh = yield* loadedArm;
          pose(fresh.spec, fresh.rig, target);
          const want = worldOf(fresh.rig);
          expect(worldOf(a.rig)).toBe(want);
          expect(worldOf(b.rig)).toBe(want);
          yield* Scope.close(fresh.scope, Exit.void);
        }
        // The five poses are five pictures, not one.
        const seen = new Set<string>();
        for (const target of TARGETS) {
          pose(a.spec, a.rig, target);
          seen.add(worldOf(a.rig));
        }
        expect(seen.size).toBe(TARGETS.length);
        yield* Scope.close(a.scope, Exit.void);
        yield* Scope.close(b.scope, Exit.void);
      }),
  );

  it.effect(
    'makes every path afresh each frame: after a shuffled history, the paths drawn are a new rig’s',
    () =>
      Effect.gen(function* () {
        const times = Array.from(
          { length: SHUFFLED },
          (_, i) => ((i * 37) % SHUFFLED) * (4 / SHUFFLED),
        );
        const live = yield* armLoaded('canvas');
        let off = 0;
        const drawn = new Set<string>();
        for (const t of times) {
          const got = drawnPaths(live.spec, live.rig, armPose(t));
          const first = yield* armLoaded('canvas');
          const want = drawnPaths(first.spec, first.rig, armPose(t));
          yield* Scope.close(first.scope, Exit.void);
          if (got !== want) off++;
          drawn.add(want);
        }
        expect(off).toBe(0);
        // Three paths drawn a frame, and the times are many pictures (a few slack frames repeat), not one.
        for (const frame of drawn) expect(frame.match(/^fill M/gm)?.length).toBe(3);
        expect(drawn.size).toBeGreaterThan(SHUFFLED * 0.8);
        yield* Scope.close(live.scope, Exit.void);
      }).pipe(Effect.provide(RiveRuntimePainted)),
  );

  it.effect(
    'leaves every path as cut, and the boil keyed on the fresh timeline’s point has the last word',
    () =>
      Effect.gen(function* () {
        const { spec, rig, scope } = yield* armLoaded('canvas');
        // Drawn face, lower piece, upper piece: the disc 24 wide, the lower 60, the upper cut 60
        // and boiled 60.4 from 0.25 s and 59.8 from 0.5 s.
        const halves = (t: number) => reaches(drawnPaths(spec, rig, armPose(t)));
        for (const [t, upper] of [
          [0.1, 30],
          [0.3, 30.2],
          [0.6, 29.9],
        ] as const) {
          const [face, lower, up] = halves(t);
          expect(face).toBeCloseTo(12, 4);
          expect(lower).toBeCloseTo(30, 4);
          expect(up).toBeCloseTo(upper, 4);
        }
        yield* Scope.close(scope, Exit.void);
      }).pipe(Effect.provide(RiveRuntimePainted)),
  );

  it.effect('refuses a name the rig lacks, listing what it has, and stands nothing', () =>
    Effect.gen(function* () {
      const arm = armRig('webgl2');
      const missing = (spec: RivePropSpec) =>
        Effect.gen(function* () {
          const { film, stood } = watched(
            armFilm([
              { id: 'arm', min: 4, rigs: { arm: spec }, draw: (f) => f.rive('arm', armPose(f.t)) },
            ]),
          );
          const error = yield* Effect.flip(Effect.scoped(loadRigs(film)));
          expect(stood).toEqual([]);
          yield* standInDom({ record: false });
          expect(() => film.render(recorder().ctx, 1)).toThrow(/not loaded/);
          return error;
        }).pipe(Effect.scoped);
      const lacks = (
        spec: RivePropSpec,
        kind: RigNameMissing['kind'],
        name: string,
        has: string[],
      ) =>
        Effect.map(missing(spec), (error) =>
          expect(error).toEqual(RigNameMissing.make({ rig: spec.key, kind, name, has })),
        );
      yield* lacks({ ...arm, source: { ...arm.source, artboard: 'Leg' } }, 'artboard', 'Leg', [
        'Arm',
      ]);
      yield* lacks(
        { ...arm, source: { ...arm.source, timelines: ['reach', 'wave'] } },
        'timeline',
        'wave',
        ['idle', 'reach', 'boil', 'fresh'],
      );
      yield* lacks({ ...arm, source: { ...arm.source, fresh: 'clean' } }, 'timeline', 'clean', [
        'idle',
        'reach',
        'boil',
        'fresh',
      ]);
      const looping = yield* missing({ ...arm, source: { ...arm.source, fresh: 'boil' } });
      expect(looping).toEqual(
        RigUnloadable.make({
          rig: arm.key,
          reason: 'its fresh timeline "boil" loops; it must be one-shot',
        }),
      );
      const posing = yield* missing({
        ...arm,
        source: { ...arm.source, timelines: [...arm.source.timelines, 'fresh'] },
      });
      expect(posing).toEqual(
        RigUnloadable.make({
          rig: arm.key,
          reason: 'a pose cannot name its fresh timeline "fresh": every frame plays it first',
        }),
      );
      yield* lacks(
        { ...arm, source: { ...arm.source, numbers: ['lift', 'elbow'] } },
        'view-model number',
        'elbow',
        ['lift', 'reach'],
      );
      yield* lacks(
        { ...arm, source: { ...arm.source, stateMachine: 'Walk' } },
        'state machine',
        'Walk',
        ['Binds'],
      );
      yield* lacks({ ...arm, source: { ...arm.source, refresh: ['wrist'] } }, 'bone', 'wrist', []);
      yield* lacks({ ...arm, face: { node: 'eye', height: 4 } }, 'node', 'eye', []);
      const unreadable = yield* missing({ ...arm, source: { ...arm.source, riv: '/no/such.riv' } });
      expect(unreadable._tag).toBe('RigUnloadable');
    }).pipe(Effect.provide(RiveRuntimeBun)),
  );

  it.effect('fails a frame whose pose names what the rig lacks, naming it', () =>
    Effect.gen(function* () {
      const { spec, rig, scope } = yield* loadedArm;
      const ctx = recorder().ctx;
      expect(drawRig(ctx, spec, rig, { timelines: [['wave', 0]] })).toBe(
        'rig fixtures/arm/webgl2 has no timeline "wave"; it has idle, reach, boil',
      );
      expect(drawRig(ctx, spec, rig, { timelines: [], numbers: { elbow: 1 } })).toBe(
        'rig fixtures/arm/webgl2 has no view-model number "elbow"; it has lift, reach',
      );
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
