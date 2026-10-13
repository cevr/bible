// A film's rigs loaded before its first frame (`loadRigs`): every rig its
// drawings declare (`film.rigs.declared`), each made from its built file
// through the `RiveRuntime` the host gives (a page's, Bun's), and stood on the
// film for its draws. A rig is its file, parsed once: each frame poses an
// artboard instance of its own made from it (`drawRig`). Each wasm object a
// rig holds (the file, the artboard its names were checked on, the scratch
// matrix, the surfaces it draws on) is the load scope's and freed when it
// closes; the rigs stand on the film until then. Each name a declaration
// gives is checked against the file here, so a missing one fails the load,
// listing what the file has, and nothing is drawn.

import type { Artboard, File, LinearAnimation, RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Exit, Option, Scope } from 'effect';
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

/** The view model's numbers a pose may set: the declared ones, else every one the model has. */
const numberNames = (spec: RivePropSpec, has: ReadonlyArray<string>) =>
  Option.getOrElse(Option.fromNullishOr(spec.source.numbers), () => has);

/**
 * One declared rig: its file parsed once, every name it declares checked on an
 * instance of its artboard, every object the scope's. Its frames make their
 * own instances (`drawRig`).
 */
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
  // An instance of the artboard, its names read and checked; the frames make their own.
  const artboard: Artboard = yield* owned(
    Effect.suspend(() =>
      found(file.artboardByName(source.artboard), () =>
        missing('artboard', source.artboard, artboardNames(file))(),
      ),
    ),
    (a) => a.delete(),
  );

  // The declared timelines: the file's own, which every instance of the artboard shares.
  const animations = namesOf(artboard.animationCount(), (i) => artboard.animationByIndex(i).name);
  const timelines = new Map<string, LinearAnimation>();
  for (const name of source.timelines) {
    const at = animations.indexOf(name);
    if (at < 0) return yield* missing('timeline', name, animations)();
    timelines.set(name, artboard.animationByIndex(at));
  }

  // The view model a frame's own instance is made from, and the numbers it has.
  const model = Option.fromNullishOr(file.defaultArtboardViewModel(artboard));
  const vmNumbers = yield* Option.match(model, {
    onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
    onSome: (m) =>
      Effect.acquireUseRelease(
        Effect.sync(() => m.defaultInstance()),
        (v) =>
          Effect.sync(() =>
            v
              .getProperties()
              .filter((p) => `${p.type}` === 'number')
              .map((p) => p.name),
          ),
        (v) => Effect.sync(() => v.delete()),
      ),
  });
  const numbers = numberNames(spec, vmNumbers);
  for (const name of numbers)
    if (!vmNumbers.includes(name)) return yield* missing('view-model number', name, vmNumbers)();

  for (const { node } of Option.toArray(Option.fromNullishOr(spec.face)))
    yield* found(artboard.node(node), missing('node', node, []));

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
    file,
    timelines,
    model: Option.getOrUndefined(model),
    numbers: new Set(numbers),
    scratch,
    surfaces,
  };
  return rig;
});

/**
 * Load every rig `film`'s drawings declare and stand them on it for its draws,
 * until the caller's scope closes: what a film's load path runs before its
 * first frame (`narratedFilms` in a page, `check --draw` in Bun). Everything
 * it acquires is held in a scope of its own under the caller's, closed at
 * once, releasing it all, when any rig fails to load. The film, ready to draw.
 */
export const loadRigs = Effect.fn('Rive.loadRigs')(function* (
  film: Film,
): Effect.fn.Return<Film, RigUnloadable | RigNameMissing, RiveRuntime | Scope.Scope> {
  const own = yield* Scope.fork(yield* Scope.Scope, 'sequential');
  return yield* Effect.gen(function* () {
    const loaded = new Map<RivePropSpec, LoadedRig>();
    for (const spec of film.rigs.declared) loaded.set(spec, yield* loadRig(spec));
    yield* Effect.acquireRelease(
      Effect.sync(() => film.rigs.stand(loaded)),
      (down) => Effect.sync(down),
    );
    return film;
  }).pipe(
    Scope.provide(own),
    Effect.onError((cause) => Scope.close(own, Exit.failCause(cause))),
  );
});
