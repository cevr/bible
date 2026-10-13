// The Rive engine on the fixture rig (`canvas/fixtures/arm.ts`), in Bun with no
// browser: the Bun layer loads the runtime and the rig and leaves no global
// behind; a frame is its pose's alone, by construction (each frame poses an
// instance of its own), so after any history, the IK held full on or let go
// among it, the paths Rive's Canvas 2D renderer draws are a newly loaded
// rig's, number for number; and a declaration that names what the rig lacks
// fails the load, listing what it has, with nothing stood on the film.

import canvasWasm from '@rive-app/canvas-advanced/rive.wasm' with { type: 'file' };
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Exit, Fiber, FileSystem, Layer, Option, Schema, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import { countedRive } from '../canvas/fixtures/rive-counted.ts';
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
      expect([...rig.numbers]).toEqual(['lift', 'reach']);
      // Posed, its face declared, and nothing drawn.
      expect(
        drawRig(recorder(200, 200, { record: false }).ctx, spec, rig, armPose(0.6)),
      ).toBeUndefined();
      yield* Scope.close(scope, Exit.void);
      expect(Reflect.has(globalThis, 'document')).toBe(had);
      expect(Object.is(Reflect.get(globalThis, 'document'), before)).toBe(true);
    }),
  );

  it.live(
    'a scope closed while its rigs still load frees each file once, after the load is done with it, and stands nothing',
    () => {
      const { counts, faults, layer } = countedRive();
      return Effect.gen(function* () {
        yield* standInDom({ record: false });
        const parsing = yield* Deferred.make<boolean>();
        const parse = yield* Deferred.make<boolean>();
        faults.parsed = () =>
          Effect.runPromise(
            Effect.andThen(Deferred.succeed(parsing, true), Effect.asVoid(Deferred.await(parse))),
          );
        const film = armFilm([armScene('arm', 'webgl2')]);
        const scope = yield* Scope.make();
        const loading = yield* Effect.forkChild(Scope.provide(loadRigs(film), scope));
        // The caller's scope closes while the rig's file is parsed, and the load is not stopped.
        yield* Deferred.await(parsing);
        yield* Scope.close(scope, Exit.void);
        yield* Deferred.succeed(parse, true);
        yield* Fiber.await(loading);
        expect(counts.afterFree).toBe(0);
        expect(counts.files).toBe(1);
        expect(counts.unrefs).toBe(counts.files);
        expect(counts.deletes).toBe(counts.artboards);
        expect(counts.viewModelDeletes).toBe(counts.viewModels);
        expect(() => film.render(recorder().ctx, 1)).toThrow(/not loaded/);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
  );

  it.effect(
    'a frame that throws keeps nothing: what it made is freed by the next frame, or by the scope',
    () => {
      const { counts, faults, layer } = countedRive();
      return Effect.gen(function* () {
        const { spec, rig, scope } = yield* armLoaded('webgl2');
        const ctx = recorder(200, 200, { record: false }).ctx;
        // The load keeps one artboard (its names checked on it) until its scope closes.
        const kept = () => ({
          artboards: counts.artboards - counts.deletes,
          viewModels: counts.viewModels - counts.viewModelDeletes,
          timelines: counts.timelines - counts.timelineDeletes,
        });
        // The runtime itself throws as the artboard advances, three frames running.
        const thrown = /Cannot pass .* as a Artboard/;
        faults.throws = 3;
        for (let i = 0; i < 3; i++)
          expect(() => drawRig(ctx, spec, rig, armPose(0.6 + i))).toThrow(thrown);
        // Only the last frame's: each frame frees what the one before it left.
        expect(kept()).toMatchObject({ artboards: 2, viewModels: 1 });
        expect(drawRig(ctx, spec, rig, armPose(1))).toBeUndefined();
        expect(kept()).toEqual({ artboards: 1, viewModels: 0, timelines: 0 });
        faults.throws = 1;
        expect(() => drawRig(ctx, spec, rig, armPose(2))).toThrow(thrown);
        yield* Scope.close(scope, Exit.void);
        expect(kept()).toEqual({ artboards: 0, viewModels: 0, timelines: 0 });
        expect(counts.viewModels).toBeGreaterThan(4);
        expect(counts.timelines).toBeGreaterThan(4);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
  );

  it.effect(
    'a film loaded into two scopes draws with a live load, whichever scope closes first',
    () => {
      const { counts, layer } = countedRive();
      return Effect.gen(function* () {
        yield* standInDom({ record: false });
        const film = armFilm([armScene('arm', 'webgl2')]);
        const first = yield* Scope.make();
        const second = yield* Scope.make();
        yield* Scope.provide(loadRigs(film), first);
        yield* Scope.provide(loadRigs(film), second);
        yield* Scope.close(first, Exit.void);
        film.render(recorder().ctx, 1);
        yield* Scope.close(second, Exit.void);
        expect(() => film.render(recorder().ctx, 1)).toThrow(/not loaded/);
        expect(counts.afterFree).toBe(0);
        expect(counts.unrefs).toBe(2);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
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
      expect(rigOne?.file).not.toBe(rigTwo?.file);
      // Drawn while it stands; refused, naming the loader, once its scope has closed.
      film.render(recorder().ctx, 1);
      yield* Scope.close(scope, Exit.void);
      expect(() => film.render(recorder().ctx, 1)).toThrow(/not loaded/);
    }).pipe(Effect.provide(RiveRuntimeBun), Effect.scoped),
  );

  it.effect(
    'draws a frame from its pose alone: after a shuffled history, the IK full on and let go among it, every path drawn is a newly loaded rig’s',
    () =>
      Effect.gen(function* () {
        const times = Array.from(
          { length: SHUFFLED },
          (_, i) => ((i * 37) % SHUFFLED) * (4 / SHUFFLED),
        );
        const between = [...HISTORY_A, ...HISTORY_B];
        const live = yield* armLoaded('canvas');
        let off = 0;
        const drawn = new Set<string>();
        for (const [i, t] of times.entries()) {
          for (const p of [i, i + 2].flatMap((k) => between.slice(k % between.length).slice(0, 1)))
            drawnPaths(live.spec, live.rig, p);
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

  it.effect('draws each path as cut, and the boil’s width at its time', () =>
    Effect.gen(function* () {
      const { spec, rig, scope } = yield* armLoaded('canvas');
      // Drawn face, lower piece, upper piece: the disc 24 wide, the lower 60, the upper cut 60
      // and boiled 60.4 from 0.25 s and 59.8 from 0.5 s, each path centred on its shape.
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
        ['idle', 'reach', 'boil'],
      );
      yield* lacks(
        { ...arm, source: { ...arm.source, numbers: ['lift', 'elbow'] } },
        'view-model number',
        'elbow',
        ['lift', 'reach'],
      );
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
