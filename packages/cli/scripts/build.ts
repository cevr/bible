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

/** Stages onnxruntime's native dylib beside the binary.
 *
 *  The compiled binary embeds `onnxruntime_binding.node` and Bun extracts it
 *  into the OS temp dir at load time — but the binding links
 *  `@rpath/libonnxruntime.<version>.dylib`, which Bun does not embed, so
 *  dlopen fails and the vector leg reads as `embedder` absence. The dylib is
 *  shipped in `data/onnxruntime/` and `ensureOnnxDylibs` copies it into the
 *  temp dir before the model loads. Resolved from the installed
 *  `onnxruntime-node` so the staged version is exactly the one the embedded
 *  binding was built against. */
const stageOnnxDylibs = Effect.fn('stageOnnxDylibs')(function* (input: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly rootDir: string;
  readonly binDir: string;
}) {
  // Resolved through the dependency chain the bundle actually follows:
  // transformers is core's dependency and onnxruntime-node is transformers',
  // so under Bun's isolated linker neither is visible from the CLI package
  // directly.
  const transformers = Bun.resolveSync(
    '@huggingface/transformers/package.json',
    input.path.resolve(input.rootDir, '..', 'core'),
  );
  const resolved = Bun.resolveSync(
    'onnxruntime-node/package.json',
    input.path.dirname(transformers),
  );
  const nativeDir = input.path.join(
    input.path.dirname(resolved),
    'bin',
    'napi-v6',
    'darwin',
    'arm64',
  );
  const entries = yield* input.fs.readDirectory(nativeDir);
  const dylibs = entries.filter((entry) => entry.endsWith('.dylib'));
  if (dylibs.length === 0) {
    return yield* new BuildError({ cause: `no dylibs in ${nativeDir}` });
  }
  for (const destinationRoot of [
    input.path.join(input.rootDir, 'data'),
    input.path.join(input.binDir, 'data'),
  ]) {
    const destination = input.path.join(destinationRoot, 'onnxruntime');
    yield* input.fs.makeDirectory(destination, { recursive: true });
    for (const dylib of dylibs) {
      yield* input.fs.copyFile(
        input.path.join(nativeDir, dylib),
        input.path.join(destination, dylib),
      );
    }
  }
  yield* Effect.log(`✅ onnxruntime dylibs staged: ${dylibs.join(', ')}`);
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
        plugins: [
          // See scripts/sharp-stub.ts: transformers' image dependency cannot
          // load inside a compiled binary, and the text pipeline never uses it.
          {
            name: 'stub-sharp',
            setup(builder) {
              builder.onResolve({ filter: /^sharp$/ }, () => ({
                path: path.join(rootDir, 'scripts', 'sharp-stub.ts'),
              }));
            },
          },
        ],
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
  yield* stageOnnxDylibs({ fs, path, rootDir, binDir });
  const nodeModulesBin = path.join(rootDir, 'node_modules/.bin/bible');
  yield* fs.copyFile(binaryPath, nodeModulesBin);
  yield* Effect.log(`✅ Copied to: ${nodeModulesBin}`);
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
