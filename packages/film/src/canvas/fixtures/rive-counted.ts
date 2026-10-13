// Bun's Rive layer (`RiveRuntimeBun`) with the wasm objects a rig's load and
// its frames make counted: each file loaded and each unref'd (and every call
// on a file after its unref), each artboard, view-model and timeline instance
// made and each deleted. What the lifetime tests read, so a load whose scope
// was never closed, a failed load that kept what it had acquired, a file
// freed before its load was done with it, or a frame that threw and kept its
// instances, shows in the counts. Two knobs let a test arrange the timing:
// `parsed`, awaited before each file is parsed (a load held mid-way), and
// `throws`, the number of frames whose artboard's advance the runtime itself
// refuses (asked of something not an artboard, Rive's bindings throw).

import type { Artboard, File, RiveCanvas, ViewModel } from '@rive-app/webgl2-advanced';
import { Effect, Layer, Predicate } from 'effect';
import { RiveRuntime } from '../../rive/runtime.ts';
import { RiveRuntimeBun } from '../../rive/runtime-bun.ts';

/** What the counted layer has seen made and freed. */
interface RiveCounts {
  files: number;
  unrefs: number;
  /** Calls on a file after it was unref'd: each a use after free. */
  afterFree: number;
  artboards: number;
  deletes: number;
  viewModels: number;
  viewModelDeletes: number;
  timelines: number;
  timelineDeletes: number;
}

/** The timing a test arranges: what each parse waits for, and how many advances throw. */
interface Faults {
  parsed: () => Promise<void>;
  throws: number;
}

/** `made`'s `delete` counted into `deleted`. */
const countedDelete = <A extends { delete: () => void }>(made: A, deleted: () => void): A => {
  const free = made.delete.bind(made);
  made.delete = () => {
    deleted();
    free();
  };
  return made;
};

/** `artboard`, its `delete` counted and its `advance` refused while faults remain; none (no artboard by that name) passed on. */
const countedArtboard = (artboard: Artboard, counts: RiveCounts, faults: Faults): Artboard => {
  if (!Reflect.has(Object(artboard), 'delete')) return artboard;
  counts.artboards += 1;
  const advance = artboard.advance;
  artboard.advance = (seconds) => {
    if (faults.throws > 0) {
      faults.throws -= 1;
      // Asked of something not an artboard, Rive's bindings throw: the runtime's own throw, mid-frame.
      return Reflect.apply(advance, {}, [seconds]);
    }
    return Reflect.apply(advance, artboard, [seconds]);
  };
  return countedDelete(artboard, () => {
    counts.deletes += 1;
  });
};

/** `model`, each instance it makes and each one deleted counted. */
const countedModel = (model: ViewModel | null, counts: RiveCounts): ViewModel | null => {
  if (model === null) return model;
  const instance = model.defaultInstance.bind(model);
  model.defaultInstance = () => {
    counts.viewModels += 1;
    return countedDelete(instance(), () => {
      counts.viewModelDeletes += 1;
    });
  };
  return model;
};

/** A view of `file`: its `unref`, the artboards and view models it makes, and each call after its unref counted. */
const countedFile = (file: File, counts: RiveCounts, faults: Faults): File => {
  counts.files += 1;
  let freed = false;
  const used = () => {
    if (freed) counts.afterFree += 1;
  };
  return new Proxy(file, {
    get: (target, key) => {
      const value: unknown = Reflect.get(target, key);
      if (!Predicate.isFunction(value)) return value;
      if (key === 'unref')
        return () => {
          used();
          freed = true;
          counts.unrefs += 1;
          target.unref();
        };
      if (key === 'artboardByName')
        return (name: string) => {
          used();
          return countedArtboard(target.artboardByName(name), counts, faults);
        };
      if (key === 'artboardByIndex')
        return (index: number) => {
          used();
          return countedArtboard(target.artboardByIndex(index), counts, faults);
        };
      if (key === 'defaultArtboardViewModel')
        return (artboard: Artboard) => {
          used();
          return countedModel(target.defaultArtboardViewModel(artboard), counts);
        };
      return (...args: ReadonlyArray<unknown>): unknown => {
        used();
        return Reflect.apply(value, target, args);
      };
    },
  });
};

/** `runtime`, every file it loads and every timeline instance it makes counted (a view of it: the runtime itself is untouched). */
const countedRuntime = (runtime: RiveCanvas, counts: RiveCounts, faults: Faults): RiveCanvas => {
  const timeline = new Proxy(runtime.LinearAnimationInstance, {
    construct: (target, args) => {
      counts.timelines += 1;
      const made: { delete: () => void } = Reflect.construct(target, args);
      return countedDelete(made, () => {
        counts.timelineDeletes += 1;
      });
    },
  });
  return new Proxy(runtime, {
    get: (target, key) => {
      if (key === 'LinearAnimationInstance') return timeline;
      if (key === 'load')
        return (bytes: Uint8Array) =>
          faults
            .parsed()
            .then(() => target.load(bytes))
            .then((file) => countedFile(file, counts, faults));
      return Reflect.get(target, key);
    },
  });
};

/** A Bun Rive layer that counts, its counts, and the faults a test sets. */
export const countedRive = () => {
  const counts: RiveCounts = {
    files: 0,
    unrefs: 0,
    afterFree: 0,
    artboards: 0,
    deletes: 0,
    viewModels: 0,
    viewModelDeletes: 0,
    timelines: 0,
    timelineDeletes: 0,
  };
  const faults: Faults = { parsed: () => Effect.runPromise(Effect.void), throws: 0 };
  const layer = Layer.effect(
    RiveRuntime,
    Effect.gen(function* () {
      const rive = yield* RiveRuntime;
      return RiveRuntime.of({
        ...rive,
        runtime: (engine) =>
          Effect.map(rive.runtime(engine), (r) => countedRuntime(r, counts, faults)),
      });
    }),
  ).pipe(Layer.provide(RiveRuntimeBun));
  return { counts, faults, layer };
};
