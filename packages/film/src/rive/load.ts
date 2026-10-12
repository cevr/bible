// A film's rigs loaded before its first frame (`loadRigs`): every rig its
// drawings declare (`film.rigs.declared`), each made from its built file
// through the `RiveRuntime` the host gives (a page's, Bun's), and stood on the
// film for its draws. Each wasm object a rig is made of (the file, the
// artboard, every timeline's instance, the machine, the view model's
// instance, the scratch matrix, the surfaces it draws on) is the load scope's
// and freed when it closes; the rigs stand on the film until then. Each name
// a declaration gives is checked against the file here, so a missing one
// fails the load, listing what the file has, and nothing is drawn; so is its
// fresh timeline (`RiveSource.fresh`), which must play once and which no pose
// may name.

import type { Artboard, File, RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Option, type Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import { type LoadedRig, type RivePropSpec, rigSurfaces } from '../canvas/rive.ts';
import { RigNameMissing, RigUnloadable } from '../core/errors.ts';
import { RiveRuntime } from './runtime.ts';

/** `acquire`'s value, freed by `free` when the load's scope closes. */
const owned = <A, E>(acquire: Effect.Effect<A, E>, free: (a: A) => void) =>
  Effect.acquireRelease(acquire, (a) => Effect.sync(() => free(a)));

/** What the runtime answered for a name, or `missing` where it answered none. */
const found = <A, E>(value: A, missing: () => E) =>
  Effect.mapError(Effect.fromOption(Option.fromNullishOr(value)), () => missing());

/** The `count` names `nameAt` reads, in the file's order. */
const namesOf = (count: number, nameAt: (i: number) => string) =>
  Array.from({ length: count }, (_, i) => nameAt(i));

/** The file's artboard names: each read from an instance made for it and deleted at once. */
const artboardNames = (file: File) =>
  namesOf(file.artboardCount(), (i) => {
    const artboard = file.artboardByIndex(i);
    const name = artboard.name;
    artboard.delete();
    return name;
  });

/** The file's bytes made into a file, which the scope unrefs. */
const fileOf = (spec: RivePropSpec, runtime: RiveCanvas, bytes: Uint8Array) => {
  const unloadable = (reason: string) => RigUnloadable.make({ rig: spec.key, reason });
  return owned(
    Effect.flatMap(
      Effect.tryPromise({
        try: () => runtime.load(bytes),
        catch: (cause) => unloadable(String(cause)),
      }),
      (file) => found(file, () => unloadable(`${spec.source.riv} is not a Rive file`)),
    ),
    (file) => file.unref(),
  );
};

/** A timeline's `loopValue` when it plays once and holds (Rive's `Loop.oneShot`). */
const ONE_SHOT = 0;

/** The view model's numbers a pose may set: the declared ones, else every one the model has. */
const numberNames = (spec: RivePropSpec, has: ReadonlyArray<string>) =>
  Option.getOrElse(Option.fromNullishOr(spec.source.numbers), () => has);

/** One declared rig, made from its file: every name checked, every object the scope's. */
const loadRig = Effect.fn('Rive.loadRig')(function* (spec: RivePropSpec) {
  const rive = yield* RiveRuntime;
  const relabel = (error: RigUnloadable) =>
    RigUnloadable.make({ rig: spec.key, reason: `${error.rig}: ${error.reason}` });
  const missing = (kind: RigNameMissing['kind'], name: string, has: ReadonlyArray<string>) => () =>
    RigNameMissing.make({ rig: spec.key, kind, name, has: [...has] });
  const { source } = spec;

  const runtime = yield* Effect.mapError(rive.runtime(spec.engine), relabel);
  const bytes = yield* Effect.mapError(rive.read(source.riv), relabel);
  const file = yield* fileOf(spec, runtime, bytes);
  const artboard: Artboard = yield* owned(
    Effect.suspend(() =>
      found(file.artboardByName(source.artboard), () =>
        missing('artboard', source.artboard, artboardNames(file))(),
      ),
    ),
    (a) => a.delete(),
  );

  // Every timeline of the artboard, one instance each: the fresh one, and the rest a frame is posed from.
  const animations = namesOf(artboard.animationCount(), (i) => artboard.animationByIndex(i).name);
  const all = yield* Effect.forEach(animations, (_, i) =>
    owned(
      Effect.sync(
        () => new runtime.LinearAnimationInstance(artboard.animationByIndex(i), artboard),
      ),
      (t) => t.delete(),
    ),
  );
  const freshAt = animations.indexOf(source.fresh);
  const fresh = yield* found(all[freshAt], missing('timeline', source.fresh, animations));
  // A one-shot holds its last keys past its end, where the engine plays it; a loop would not.
  if (artboard.animationByIndex(freshAt).loopValue !== ONE_SHOT)
    return yield* RigUnloadable.make({
      rig: spec.key,
      reason: `its fresh timeline "${source.fresh}" loops; it must be one-shot`,
    });
  if (source.timelines.some((name) => name === source.fresh))
    return yield* RigUnloadable.make({
      rig: spec.key,
      reason: `a pose cannot name its fresh timeline "${source.fresh}": every frame plays it first`,
    });
  const rest = all.filter((_, i) => i !== freshAt);
  const timelines = new Map<string, (typeof all)[number]>();
  for (const name of source.timelines) {
    const t = yield* found(all[animations.indexOf(name)], missing('timeline', name, animations));
    timelines.set(name, t);
  }

  const machine = yield* Option.match(Option.fromNullishOr(source.stateMachine), {
    onNone: () => Effect.succeedNone,
    onSome: (name) =>
      Effect.asSome(
        owned(
          Effect.flatMap(
            found(
              artboard.stateMachineByName(name),
              missing(
                'state machine',
                name,
                namesOf(artboard.stateMachineCount(), (i) => artboard.stateMachineByIndex(i).name),
              ),
            ),
            (m) => Effect.sync(() => new runtime.StateMachineInstance(m, artboard)),
          ),
          (m) => m.delete(),
        ),
      ),
  });

  // The view model's instance, bound to the machine and the artboard: its numbers drive the binds.
  const vm = yield* Option.match(Option.fromNullishOr(file.defaultArtboardViewModel(artboard)), {
    onNone: () => Effect.succeedNone,
    onSome: (model) =>
      Effect.asSome(
        owned(
          Effect.sync(() => model.defaultInstance()),
          (v) => v.delete(),
        ),
      ),
  });
  for (const v of Option.toArray(vm)) {
    for (const m of Option.toArray(machine)) m.bindViewModelInstance(v);
    artboard.bindViewModelInstance(v);
  }
  const vmNumbers = Option.match(vm, {
    onNone: () => [],
    onSome: (v) =>
      v
        .getProperties()
        .filter((p) => `${p.type}` === 'number')
        .map((p) => p.name),
  });
  const numbers = yield* Effect.forEach(numberNames(spec, vmNumbers), (name) =>
    Effect.map(
      found(
        Option.getOrUndefined(Option.map(vm, (v) => v.number(name))),
        missing('view-model number', name, vmNumbers),
      ),
      (input) => ({ name, input, rest: input.value }),
    ),
  );

  const refresh = yield* Effect.forEach(source.refresh ?? [], (name) =>
    found(artboard.bone(name), missing('bone', name, [])),
  );
  const face = yield* Option.match(Option.fromNullishOr(spec.face), {
    onNone: () => Effect.succeedNone,
    onSome: ({ node }) => Effect.asSome(found(artboard.node(node), missing('node', node, []))),
  });

  const scratch = yield* owned(
    Effect.sync(() => new runtime.Mat2D()),
    (m) => m.delete(),
  );
  const surfaces = yield* owned(
    Effect.sync(() => rigSurfaces(runtime, () => file.artboardByName(source.artboard), scratch)),
    (s) => s.free(),
  );
  const rig: LoadedRig = {
    runtime,
    paints: rive.paints,
    artboard,
    fresh,
    rest,
    timelines,
    numbers,
    machine: Option.getOrUndefined(machine),
    refresh,
    face: Option.getOrUndefined(face),
    scratch,
    surfaces,
  };
  return rig;
});

/**
 * Load every rig `film`'s drawings declare and stand them on it for its draws,
 * until the scope closes: what a film's load path runs before its first frame
 * (`narratedFilms` in a page, `check --draw` in Bun). The film, ready to draw.
 */
export const loadRigs = Effect.fn('Rive.loadRigs')(function* (
  film: Film,
): Effect.fn.Return<Film, RigUnloadable | RigNameMissing, RiveRuntime | Scope.Scope> {
  const loaded = new Map<RivePropSpec, LoadedRig>();
  for (const spec of film.rigs.declared) loaded.set(spec, yield* loadRig(spec));
  yield* Effect.acquireRelease(
    Effect.sync(() => film.rigs.stand(loaded)),
    (down) => Effect.sync(down),
  );
  return film;
});
