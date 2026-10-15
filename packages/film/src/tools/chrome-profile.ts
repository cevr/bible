// A Chrome's profile: `<tmp>/bible-film-chrome/<pid>`, one per process, since
// Bun spawns one Chrome per process. Bun's own default, a temp profile per
// Chrome, is never removed (Bun 1.4.3): a test run left one per worker, up to
// 125 MB each, until the disk filled.

// oxlint-disable-next-line effect/noNodeBuiltinImport -- the exit handler's delete: an exiting process runs no effect, only synchronous calls
import { rmSync } from 'node:fs';
import { Effect, FileSystem, Path } from 'effect';
import { BrowserFailed } from './errors.ts';

/** Where every process's Chrome keeps its profile, a folder per process id. */
export const PROFILES = 'bible-film-chrome';

/** Whether process `pid` still runs (`EPERM`: it runs, as another user). */
const alive = (pid: number) =>
  Effect.try(() => process.kill(pid, 0)).pipe(
    Effect.as(true),
    Effect.catch((error) => Effect.succeed(Reflect.get(Object(error.cause), 'code') === 'EPERM')),
  );

/**
 * This process's Chrome profile, `<root>/<pid>`, removed when the process
 * exits (after its Chrome is killed). A process killed before its exit
 * handler runs leaves its folder, so the folders of processes no longer
 * running are removed first.
 */
export const profileFolder = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(root, { recursive: true });
    const orphans = yield* Effect.filter(
      (yield* fs.readDirectory(root)).filter((name) => /^\d+$/.test(name)),
      (name) => Effect.map(alive(Number(name)), (running) => !running),
    );
    yield* Effect.forEach(
      orphans,
      (name) => Effect.ignore(fs.remove(path.join(root, name), { recursive: true })),
      { discard: true },
    );
    const folder = path.join(root, String(process.pid));
    yield* fs.makeDirectory(folder, { recursive: true });
    process.once('exit', () => {
      Bun.WebView.closeAll();
      rmSync(folder, { recursive: true, force: true });
    });
    return folder;
  }).pipe(Effect.mapError((cause) => BrowserFailed.make({ reason: String(cause) })));
