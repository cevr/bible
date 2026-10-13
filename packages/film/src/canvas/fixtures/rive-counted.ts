// Bun's Rive layer (`RiveRuntimeBun`) with the wasm objects a rig's load and
// its frames make counted: each file loaded and each unref'd, each artboard
// instance made and each deleted. What the lifetime tests read, so a load
// whose scope was never closed, or a failed load that kept what it had
// acquired, shows as files not unref'd.

import type { Artboard, File, RiveCanvas } from '@rive-app/webgl2-advanced';
import { Effect, Layer } from 'effect';
import { RiveRuntime } from '../../rive/runtime.ts';
import { RiveRuntimeBun } from '../../rive/runtime-bun.ts';

/** What the counted layer has seen made and freed. */
interface RiveCounts {
  files: number;
  unrefs: number;
  artboards: number;
  deletes: number;
}

/** `artboard`, its `delete` counted; none (the file has no artboard by that name) passed on. */
const countedArtboard = (artboard: Artboard, counts: RiveCounts): Artboard => {
  if (!Reflect.has(Object(artboard), 'delete')) return artboard;
  counts.artboards += 1;
  const free = artboard.delete.bind(artboard);
  artboard.delete = () => {
    counts.deletes += 1;
    free();
  };
  return artboard;
};

/** `file`, its `unref` and every artboard it makes counted. */
const countedFile = (file: File, counts: RiveCounts): File => {
  counts.files += 1;
  const unref = file.unref.bind(file);
  const byName = file.artboardByName.bind(file);
  const byIndex = file.artboardByIndex.bind(file);
  file.unref = () => {
    counts.unrefs += 1;
    unref();
  };
  file.artboardByName = (name) => countedArtboard(byName(name), counts);
  file.artboardByIndex = (index) => countedArtboard(byIndex(index), counts);
  return file;
};

/** `runtime`, every file it loads counted (a view of it: the runtime itself is untouched). */
const countedRuntime = (runtime: RiveCanvas, counts: RiveCounts): RiveCanvas =>
  new Proxy(runtime, {
    get: (target, key) =>
      key === 'load'
        ? (bytes: Uint8Array) => target.load(bytes).then((file) => countedFile(file, counts))
        : Reflect.get(target, key),
  });

/** A Bun Rive layer that counts, and its counts. */
export const countedRive = () => {
  const counts: RiveCounts = { files: 0, unrefs: 0, artboards: 0, deletes: 0 };
  const layer = Layer.effect(
    RiveRuntime,
    Effect.gen(function* () {
      const rive = yield* RiveRuntime;
      return RiveRuntime.of({
        ...rive,
        runtime: (engine) => Effect.map(rive.runtime(engine), (r) => countedRuntime(r, counts)),
      });
    }),
  ).pipe(Layer.provide(RiveRuntimeBun));
  return { counts, layer };
};
