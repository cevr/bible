import { build } from 'bun';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Inspectable, Path, Schema, SchemaGetter } from 'effect';

import { envDefineTarget } from './env-define-target.js';

class BuildError extends Schema.TaggedError<BuildError>()('BuildError', {
  cause: Schema.Unknown,
}) {}

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson(),
  }),
);
const encodeJson = Schema.encodeUnknownEffect(JsonString);

const loadEnvDefines = Effect.fn('loadEnvDefines')(function* (rootDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const envPath = path.join(rootDir, '.env');
  const defines: Record<string, string> = {};

  if (yield* fs.exists(envPath)) {
    const content = yield* fs.readFileString(envPath);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      defines[envDefineTarget(key)] = yield* encodeJson(value);
    }
  }

  return defines;
});

/** Assets the compiled binary reads from disk rather than embedding. Each is
 *  copied out of the workspace into the CLI package's `data/` slot and again
 *  beside the binary, because `packagedDataPath` resolves from the executable's
 *  own directory first — that is the only location that travels when the binary
 *  is copied off this machine. */
const DATA_ASSETS = [
  {
    source: 'packages/core/data/topics.db',
    name: 'topics.db',
    label: 'Topics artifact',
  },
] satisfies readonly { readonly source: string; readonly name: string; readonly label: string }[];

/** Copies each built data asset into `<cli>/data/` and `<cli>/bin/data/`.
 *
 *  A missing asset is skipped rather than failing the build: `topics.db` is
 *  produced by `bun run build:topics`, which is a separate command and is not a
 *  prerequisite for compiling the CLI. Skipping is logged so a build that
 *  silently shipped no artifact is not mistaken for one that shipped it. */
const stageDataAssets = Effect.fn('stageDataAssets')(function* (input: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly rootDir: string;
  readonly binDir: string;
}) {
  const repoRoot = input.path.resolve(input.rootDir, '..', '..');
  const packageData = input.path.join(input.rootDir, 'data');
  const binaryData = input.path.join(input.binDir, 'data');
  for (const asset of DATA_ASSETS) {
    const source = input.path.join(repoRoot, asset.source);
    if (!(yield* input.fs.exists(source))) {
      yield* Effect.log(`⚠ ${asset.label} not built (${source}) — skipping`);
      continue;
    }
    for (const destination of [packageData, binaryData]) {
      yield* input.fs.makeDirectory(destination, { recursive: true });
      yield* input.fs.copyFile(source, input.path.join(destination, asset.name));
    }
    yield* Effect.log(`✅ ${asset.label} staged into ${packageData} and ${binaryData}`);
  }
});

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const rootDir = path.join(import.meta.dir, '..');
  const envDefines = yield* loadEnvDefines(rootDir);
  yield* Effect.log(`Embedding ${Object.keys(envDefines).length} environment variables from .env`);
  yield* Effect.log('Building Bible CLI...');

  const binDir = path.join(rootDir, 'bin');
  yield* fs.makeDirectory(binDir, { recursive: true });
  yield* Effect.log('Bundling and compiling to binary...');

  const cliDefines = {
    ...envDefines,
    'globalThis.__BIBLE_CLI_ROOT__': yield* encodeJson(rootDir),
  };
  const binaryPath = path.join(binDir, 'bible');
  const buildResult = yield* Effect.tryPromise({
    try: () =>
      build({
        entrypoints: [path.join(rootDir, 'src/main.ts')],
        target: 'bun',
        minify: false,
        define: cliDefines,
        compile: {
          target: 'bun-darwin-arm64',
          outfile: binaryPath,
          autoloadBunfig: false,
        },
      }),
    catch: (cause) => {
      if (cause instanceof AggregateError) {
        return new BuildError({
          cause: cause.errors.map((error) => Inspectable.toStringUnknown(error, 0)),
        });
      }
      return new BuildError({ cause });
    },
  });

  if (!buildResult.success) {
    for (const log of buildResult.logs) {
      yield* Effect.logError(Inspectable.toStringUnknown(log, 0));
    }
    return yield* new BuildError({ cause: buildResult.logs });
  }

  yield* Effect.log(`✅ Binary built: ${binaryPath}`);
  yield* stageDataAssets({ fs, path, rootDir, binDir });
  const nodeModulesBin = path.join(rootDir, 'node_modules/.bin/bible');
  yield* fs.copyFile(binaryPath, nodeModulesBin);
  yield* Effect.log(`✅ Copied to: ${nodeModulesBin}`);
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
