// The Rive engine on the fixture rig (`canvas/fixtures/arm.ts`), in Bun with no
// browser: the Bun layer loads the runtime and the rig and leaves no global
// behind; a frame is posed from rest, whatever was posed before it; and a
// declaration that names what the rig lacks fails the load, listing what it
// has, with nothing stood on the film.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Option, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import { recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import { type LoadedRig, type RivePropSpec, drawRig } from '../canvas/rive.ts';
import { RigNameMissing } from '../core/errors.ts';
import { type ArmPose, armFilm, armPose, armRig, armScene } from '../canvas/fixtures/arm.ts';
import { loadRigs } from './load.ts';
import { RiveRuntimeBun } from './runtime-bun.ts';

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

/** The fixture rig loaded in a scope of its own: the spec, the loaded rig, and the scope to close. */
const loadedArm = Effect.gen(function* () {
  const spec = armRig('webgl2');
  const { film, stood } = watched(
    armFilm([{ id: 'arm', min: 4, rigs: { arm: spec }, draw: () => {} }]),
  );
  const scope = yield* Scope.make();
  yield* Scope.provide(loadRigs(film), scope);
  const rig = yield* Effect.fromOption(Option.fromNullishOr(stood[0]?.get(spec)));
  return { spec, rig, scope };
}).pipe(Effect.provide(RiveRuntimeBun));

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

describe('the Rive engine', () => {
  it.effect('loads the runtime and the rig in Bun, and leaves no document behind', () =>
    Effect.gen(function* () {
      const had = Reflect.has(globalThis, 'document');
      const before: unknown = Reflect.get(globalThis, 'document');
      const { spec, rig, scope } = yield* loadedArm;
      expect(rig.paints).toBe(false);
      expect([...rig.timelines.keys()]).toEqual(['idle', 'reach']);
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
        ['idle', 'reach'],
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
        'rig fixtures/arm/webgl2 has no timeline "wave"; it has idle, reach',
      );
      expect(drawRig(ctx, spec, rig, { timelines: [], numbers: { elbow: 1 } })).toBe(
        'rig fixtures/arm/webgl2 has no view-model number "elbow"; it has lift, reach',
      );
      yield* Scope.close(scope, Exit.void);
    }),
  );
});
