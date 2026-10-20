// A film's rigs loaded before its first frame (`loadRigs`): every rig its
// drawings declare (`film.rigs.declared`), each made from its built file
// through the `RiveRuntime` the host gives (a page's, Bun's), and stood on the
// film for its draws. A rig is its file, parsed once: each frame poses an
// artboard instance of its own made from it (`drawRig`). Each wasm object a
// rig holds (the file, the artboard its names were checked on, the scratch
// matrix, the surfaces it draws on, what a frame that threw left in its
// in-flight slot) is the load scope's and freed when it closes; the rigs
// stand on the film until then. Each name a declaration
// gives is checked against the file here, and so is the number `ink` of a
// rig that follows the shot (`RivePropSpec.ink`), so a missing one fails the
// load, listing what the file has, and nothing is drawn.

import type { Artboard, File, LinearAnimation, RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Exit, Option, Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import {
  INK_NUMBER,
  type LoadedRig,
  type RivePropSpec,
  inFlight,
  rigSurfaces,
} from '../canvas/rive.ts';
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
  // A rig that follows the shot binds its ink to the number the frame sets.
  if (Option.isSome(Option.fromNullishOr(spec.ink)) && !vmNumbers.includes(INK_NUMBER))
    return yield* missing('view-model number', INK_NUMBER, vmNumbers)();

  for (const { node } of Option.toArray(Option.fromNullishOr(spec.face)))
    yield* found(artboard.node(node), missing('node', node, []));

  const scratch = yield* owned(
    Effect.sync(() => new runtime.Mat2D()),
    (m) => m.delete(),
  );
  // The frames' in-flight slot: what a frame that threw left is freed before the file it came from.
  const frame = yield* owned(Effect.sync(inFlight), (f) => f.free());
  const surfaces = yield* owned(
    Effect.sync(() =>
      rigSurfaces(runtime, () => file.artboardByName(source.artboard), scratch, frame),
    ),
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
    frame,
  };
  return rig;
});

/**
 * Load every rig `film`'s drawings declare and stand them on it for its draws,
 * until the caller's scope closes: what a film's load path runs before its
 * first frame (`narratedFilms` in a page, `check --draw` in Bun). The film,
 * ready to draw.
 *
 * What the load acquires is held in a scope of its own, which only the load
 * can close while it runs: interrupted or failed, it closes that scope and so
 * releases it all; done, it hands the scope to the caller's, which closes it
 * with itself. So nothing is released while the load still uses it, whenever
 * the caller's scope closes: one closed before the hand-over (its owner left
 * mid-load) closes the load's at once, after the load is done, and the film
 * is given with no rig standing, refusing to draw one.
 */
export const loadRigs = Effect.fn('Rive.loadRigs')(function* (
  film: Film,
): Effect.fn.Return<Film, RigUnloadable | RigNameMissing, RiveRuntime | Scope.Scope> {
  const caller = yield* Scope.Scope;
  const stood = Effect.gen(function* () {
    const loaded = new Map<RivePropSpec, LoadedRig>();
    for (const spec of film.rigs.declared) loaded.set(spec, yield* loadRig(spec));
    yield* Effect.acquireRelease(
      Effect.sync(() => film.rigs.stand(loaded)),
      (down) => Effect.sync(down),
    );
    return film;
  });
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const own = yield* Scope.make('sequential');
      const done = yield* Effect.exit(restore(Scope.provide(stood, own)));
      if (Exit.isFailure(done)) {
        yield* Scope.close(own, done);
        return yield* done;
      }
      yield* Scope.addFinalizerExit(caller, (exit) => Scope.close(own, exit));
      return done.value;
    }),
  );
});
