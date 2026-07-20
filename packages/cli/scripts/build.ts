import { build } from 'bun';
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Inspectable, Path, Schema, SchemaGetter } from 'effect';

class BuildError extends Schema.TaggedErrorClass<BuildError>()('BuildError', {
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
      defines[`process.env.${key}`] = yield* encodeJson(value);
    }
  }

  return defines;
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
    __BIBLE_CLI_ROOT__: yield* encodeJson(rootDir),
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
    catch: (cause) => new BuildError({ cause }),
  });

  if (!buildResult.success) {
    for (const log of buildResult.logs) {
      yield* Effect.logError(Inspectable.toStringUnknown(log, 0));
    }
    return yield* new BuildError({ cause: buildResult.logs });
  }

  yield* Effect.log(`✅ Binary built: ${binaryPath}`);
  const nodeModulesBin = path.join(rootDir, 'node_modules/.bin/bible');
  yield* fs.copyFile(binaryPath, nodeModulesBin);
  yield* Effect.log(`✅ Copied to: ${nodeModulesBin}`);
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
