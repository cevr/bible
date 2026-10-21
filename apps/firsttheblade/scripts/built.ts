/**
 * The build's stamp, `.prerender/built.json`: the hash of the sources the build
 * reads (turbo's `build` inputs, `../turbo.json`) and each file it wrote,
 * with the hash of its bytes. `bun run build` writes it last; the promise check (`./promise.ts`)
 * reads it, so the gate can check turbo's build, cached or not, and refuse a
 * `dist/` built from other sources, holding a file another build left, or
 * changed since (`docs/lessons.md` `email-promise-built-twice`).
 *
 *   bun scripts/built.ts    # writes .prerender/built.json for the dist/ there
 *
 * The stamp sits beside the server build, not in `dist/`, so it is not
 * served, and turbo caches and restores it with the build's outputs.
 */
import { createHash } from 'node:crypto';

import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

/** The app's turbo tasks, as far as the stamp reads them: the build's inputs. */
const Turbo = Schema.Struct({
  tasks: Schema.Struct({ build: Schema.Struct({ inputs: Schema.Array(Schema.String) }) }),
});

/** What the build reads: turbo's `build` inputs for the app (`../turbo.json`), each a file or a folder (`src/**`). */
const buildInputs = Effect.fn('Built.inputs')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const turbo = yield* Schema.decodeEffect(Schema.fromJsonString(Turbo))(
    yield* fs.readFileString(path.join(app, 'turbo.json')),
  );
  return turbo.tasks.build.inputs.map((input) => input.replace(/\/\*\*$/, ''));
});

/** The stamp's file, from the app. */
export const STAMP = '.prerender/built.json';

/** The stamp: the hash of the sources, and each file the build wrote (from `dist/`) with the hash of its bytes. */
const Built = Schema.Struct({
  sources: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
});

/** Every file under `entry` (a file or a folder, from the app), sorted. */
const filesOf = Effect.fn('Built.files')(function* (app: string, entry: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const full = path.join(app, entry);
  if ((yield* fs.stat(full)).type !== 'Directory') return [entry];
  const entries = (yield* fs.readDirectory(full, { recursive: true })).sort();
  const files = yield* Effect.forEach(entries, (file) =>
    Effect.map(fs.stat(path.join(full, file)), (info) =>
      [path.join(entry, file)].filter(() => info.type === 'File'),
    ),
  );
  return files.flat();
});

/** The hash of files (from the app): each file's path and bytes, in order. */
const hashOf = Effect.fn('Built.hash')(function* (app: string, files: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hash = createHash('sha256');
  yield* Effect.forEach(files, (file) =>
    Effect.map(fs.readFile(path.join(app, file)), (bytes) => {
      hash.update(`${file}\0`);
      hash.update(bytes);
    }),
  );
  return hash.digest('hex');
});

/** The hash of the build's sources as they stand. */
export const sourcesHash = Effect.fn('Built.sources')(function* (app: string) {
  const inputs = yield* buildInputs(app);
  return yield* hashOf(app, (yield* Effect.forEach(inputs, (entry) => filesOf(app, entry))).flat());
});

/** Each file of `dist/` (from `dist/`) with the hash of its bytes. */
export const builtFiles = Effect.fn('Built.dist')(function* (app: string) {
  const files = yield* filesOf(app, 'dist');
  const hashes = yield* Effect.forEach(files, (file) => hashOf(app, [file]));
  return Object.fromEntries(
    files.map((file, i) => [file.replace(/^dist\//, ''), hashes[i] ?? ''] as const),
  );
});

/** The stamp `dist/` holds, if any. */
export const readStamp = Effect.fn('Built.read')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* Effect.option(fs.readFileString(path.join(app, STAMP)));
  return Option.flatMap(text, Schema.decodeOption(Schema.fromJsonString(Built)));
});

const write = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const built: typeof Built.Type = {
    sources: yield* sourcesHash(app),
    files: yield* builtFiles(app),
  };
  const json = yield* Schema.encodeEffect(Schema.fromJsonString(Built))(built);
  yield* fs.writeFileString(path.join(app, STAMP), `${json}\n`);
  yield* Effect.logInfo('built.stamped').pipe(
    Effect.annotateLogs({ files: Object.keys(built.files).length }),
  );
});

if (import.meta.main) {
  write.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
