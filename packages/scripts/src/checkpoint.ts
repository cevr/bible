#!/usr/bin/env bun

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { DateTime, Effect, FileSystem, Path, Runtime, Schema, Terminal } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import * as ChildProcess from 'effect/unstable/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/unstable/process/ChildProcessSpawner';

import { checkBoundaries } from './checkpoint/boundaries.js';
import { LEGACY_CATEGORIES, snapshotLegacy, validateLegacySnapshot } from './checkpoint/legacy.js';
import {
  CHECKPOINT_NAMES,
  isCheckpointName,
  type CheckpointName,
  type CheckResult,
  type CommandResult,
  type RemovalBaseline,
} from './checkpoint/model.js';
import { globFiles, moduleDirectory } from './checkpoint/platform-bun/glob-host.js';
import { renderCheckpointReport } from './checkpoint/report.js';

interface JsonObject {
  readonly [key: string]: unknown;
}

class CheckpointError extends Schema.TaggedErrorClass<CheckpointError>()('CheckpointError', {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

class CheckpointFailed extends Schema.TaggedErrorClass<CheckpointFailed>()('CheckpointFailed', {}) {
  override readonly [Runtime.errorReported] = false;
}

const decodeJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);
const encodeJson = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString);

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (message: string, cause?: unknown): CheckpointError =>
  new CheckpointError({ message, cause });

const readJsonObject = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  root: string,
  filePath: string,
): Effect.Effect<JsonObject, CheckpointError> =>
  fs.readFileString(filePath).pipe(
    Effect.mapError((cause) =>
      fail(`could not read ${pathService.relative(root, filePath)}`, cause),
    ),
    Effect.flatMap((source) =>
      decodeJson(source).pipe(
        Effect.mapError((cause) =>
          fail(`${pathService.relative(root, filePath)} does not contain valid JSON`, cause),
        ),
      ),
    ),
    Effect.flatMap((value) => {
      if (isJsonObject(value)) return Effect.succeed(value);
      return Effect.fail(
        fail(`${pathService.relative(root, filePath)} must contain a JSON object`),
      );
    }),
  );

const dependencyVersions = (
  fs: FileSystem.FileSystem,
  pathService: Path.Path,
  root: string,
  manifestPath: string,
): Effect.Effect<ReadonlyMap<string, string>, CheckpointError> =>
  Effect.gen(function* () {
    const manifest = yield* readJsonObject(
      fs,
      pathService,
      root,
      pathService.join(root, manifestPath),
    );
    const rootManifest = yield* readJsonObject(
      fs,
      pathService,
      root,
      pathService.join(root, 'package.json'),
    );
    let catalog: JsonObject = {};
    if (isJsonObject(rootManifest['catalog'])) catalog = rootManifest['catalog'];
    const entries: [string, string][] = [];

    for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
      const dependencies = manifest[field];
      if (!isJsonObject(dependencies)) continue;
      for (const [name, version] of Object.entries(dependencies)) {
        if (typeof version !== 'string') continue;
        const catalogVersion = catalog[name];
        let resolvedVersion = version;
        if (version === 'catalog:' && typeof catalogVersion === 'string') {
          resolvedVersion = catalogVersion;
        }
        entries.push([name, resolvedVersion]);
      }
    }

    return new Map(entries);
  });

const parseRemovalBaseline = (value: unknown): Effect.Effect<RemovalBaseline, CheckpointError> =>
  Effect.gen(function* () {
    if (
      !isJsonObject(value) ||
      value['schemaVersion'] !== 1 ||
      !Array.isArray(value['categories'])
    ) {
      return yield* Effect.fail(fail('removal-baseline.json does not match schema version 1'));
    }

    const categories = yield* Effect.forEach(value['categories'], (category) => {
      let removalCheckpoint: unknown;
      if (isJsonObject(category)) removalCheckpoint = category['removalCheckpoint'];
      if (
        !isJsonObject(category) ||
        typeof category['id'] !== 'string' ||
        typeof category['title'] !== 'string' ||
        typeof removalCheckpoint !== 'string' ||
        !isCheckpointName(removalCheckpoint) ||
        removalCheckpoint === 'initial' ||
        !Array.isArray(category['matches']) ||
        !category['matches'].every((match) => typeof match === 'string')
      ) {
        return Effect.fail(fail('removal-baseline.json contains an invalid category'));
      }

      return Effect.succeed({
        id: category['id'],
        title: category['title'],
        removalCheckpoint,
        matches: category['matches'],
      });
    });

    return { schemaVersion: 1, categories };
  });

const commandsFor = (checkpoint: CheckpointName): readonly (readonly string[])[] => {
  switch (checkpoint) {
    case 'initial':
      return [['bun', 'run', 'gate']];
    case 'foundation':
      return [
        ['bun', 'run', '--cwd', 'packages/cli', 'typecheck'],
        ['bun', 'run', '--cwd', 'packages/cli', 'test'],
        ['bun', 'run', '--cwd', 'packages/core', 'typecheck'],
        ['bun', 'run', '--cwd', 'packages/core', 'test'],
        ['bun', 'run', 'gate'],
      ];
    case 'shared-app':
      return [
        ['bun', 'run', '--cwd', 'packages/app', 'typecheck'],
        ['bun', 'run', '--cwd', 'packages/app', 'test'],
        ['bun', 'run', '--cwd', 'apps/web', 'build'],
        ['bun', 'run', '--cwd', 'apps/web', 'test:e2e'],
        ['bun', 'run', '--cwd', 'apps/desktop', 'build'],
        ['bun', 'run', '--cwd', 'apps/desktop', 'test:e2e'],
        ['bun', 'run', 'gate'],
      ];
    case 'pre-cutover':
      return [
        ['bun', 'run', 'gate'],
        ['bun', 'run', '--cwd', 'apps/web', 'test:e2e'],
        ['bun', 'run', '--cwd', 'apps/desktop', 'test:e2e'],
      ];
  }
};

const resultStatus = (failures: readonly string[]): CheckResult['status'] => {
  if (failures.length === 0) return 'pass';
  return 'fail';
};

const resultDetails = (failures: readonly string[], success: string): readonly string[] => {
  if (failures.length === 0) return [success];
  return failures;
};

const staticResult = (name: string, failures: readonly string[], success: string): CheckResult => ({
  name,
  status: resultStatus(failures),
  details: resultDetails(failures, success),
});

const commandSuffix = (count: number): string => {
  if (count === 1) return '';
  return 's';
};

const checkpointArgument = Argument.choice('checkpoint', CHECKPOINT_NAMES);

const checkpointCommand = Command.make(
  'checkpoint',
  { checkpoint: checkpointArgument },
  ({ checkpoint }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;
      const spawner = yield* ChildProcessSpawner;
      const root = pathService.resolve(moduleDirectory, '../../../../..');
      const checkpointsDirectory = pathService.join(root, 'docs/architecture/checkpoints');
      const inventoriesDirectory = pathService.join(root, 'docs/architecture/inventories');
      const baselinePath = pathService.join(inventoriesDirectory, 'removal-baseline.json');

      const requiredFiles = [
        pathService.join(root, 'docs/architecture/solid-2-local-first-app.md'),
        pathService.join(inventoriesDirectory, 'persisted-stores.md'),
        pathService.join(root, 'docs/architecture/feature-parity.md'),
      ];
      const missingMessages = [
        'accepted architecture brief is missing',
        'persisted-store inventory is missing',
        'feature-parity matrix is missing',
      ];
      yield* Effect.forEach(requiredFiles, (filePath, index) =>
        fs.exists(filePath).pipe(
          Effect.mapError((cause) => fail(`could not inspect ${filePath}`, cause)),
          Effect.flatMap((exists) => {
            if (exists) return Effect.void;
            return Effect.fail(
              fail(missingMessages[index] ?? `required file is missing: ${filePath}`),
            );
          }),
        ),
      );

      const reviewedCommit = yield* spawner
        .string(
          ChildProcess.make('git', ['rev-parse', 'HEAD'], {
            cwd: root,
            stderr: 'inherit',
          }),
        )
        .pipe(
          Effect.map((output) => output.trim()),
          Effect.mapError((cause) => fail('unable to resolve reviewed commit', cause)),
          Effect.filterOrFail(
            (commit) => commit !== '',
            () => fail('unable to resolve reviewed commit'),
          ),
        );

      const commandResults = yield* Effect.forEach(
        commandsFor(checkpoint),
        (command) =>
          Effect.gen(function* () {
            yield* terminal.display(`\n$ ${command.join(' ')}\n`);
            const executable = command[0];
            if (executable === undefined)
              return yield* Effect.fail(fail('empty checkpoint command'));
            const exitCode = yield* spawner.exitCode(
              ChildProcess.make(executable, command.slice(1), {
                cwd: root,
                stdin: 'inherit',
                stdout: 'inherit',
                stderr: 'inherit',
              }),
            );
            return { command, exitCode } satisfies CommandResult;
          }).pipe(Effect.mapError((cause) => fail(`command failed: ${command.join(' ')}`, cause))),
        { concurrency: 1 },
      );

      const scanGlob = (pattern: string) => globFiles(root, pattern);
      const readText = (relativePath: string) =>
        fs
          .readFileString(pathService.join(root, relativePath))
          .pipe(Effect.mapError((cause) => fail(`could not read ${relativePath}`, cause)));
      const readVersions = (manifestPath: string) =>
        dependencyVersions(fs, pathService, root, manifestPath);

      const currentLegacy = yield* snapshotLegacy({
        globFiles: scanGlob,
        readText,
        readDependencies: (manifestPath) =>
          readVersions(manifestPath).pipe(Effect.map((versions) => new Set(versions.keys()))),
      });
      let baseline: RemovalBaseline;
      if (yield* fs.exists(baselinePath)) {
        const encoded = yield* fs.readFileString(baselinePath);
        baseline = yield* decodeJson(encoded).pipe(Effect.flatMap(parseRemovalBaseline));
      } else {
        if (checkpoint !== 'initial') {
          return yield* Effect.fail(fail('initial removal baseline is missing'));
        }
        baseline = currentLegacy;
        const encoded = yield* encodeJson(baseline);
        yield* fs.writeFileString(baselinePath, `${encoded}\n`);
      }

      const boundaryChecks = yield* checkBoundaries({
        checkpoint,
        globFiles: scanGlob,
        readText,
        readDependencyVersions: readVersions,
        displayPath: (relativePath) => pathService.join(root, relativePath),
      });
      let initialFailures: readonly string[] = [];
      if (checkpoint === 'initial') {
        initialFailures = currentLegacy.categories
          .filter(
            (category) =>
              category.id !== 'shared-platform-discriminators' && category.matches.length === 0,
          )
          .map((category) => `${category.title} has no identified removal targets`);
      }
      const checks = [
        ...boundaryChecks,
        staticResult(
          'initial removal inventory',
          initialFailures,
          'every known legacy authority has a finite initial target list',
        ),
        staticResult(
          'legacy removal schedule',
          validateLegacySnapshot(checkpoint, baseline, currentLegacy, root),
          `${String(LEGACY_CATEGORIES.length)} legacy categories are bounded and on schedule`,
        ),
        staticResult(
          'checkpoint command suite',
          commandResults
            .filter((result) => result.exitCode !== 0)
            .map((result) => `${result.command.join(' ')} exited ${String(result.exitCode)}`),
          `${String(commandResults.length)} required command${commandSuffix(commandResults.length)} passed`,
        ),
      ];
      let status: 'PASS' | 'FAIL' = 'FAIL';
      if (checks.every((check) => check.status === 'pass')) status = 'PASS';
      const generatedAt = DateTime.formatIso(yield* DateTime.now);
      const report = renderCheckpointReport({
        checkpoint,
        reviewedCommit,
        generatedAt,
        checks,
        commands: commandResults,
        currentLegacy,
        status,
        repositoryRoot: root,
      });

      yield* fs.writeFileString(pathService.join(checkpointsDirectory, `${checkpoint}.md`), report);
      yield* terminal.display(`\n${checkpoint} architecture checkpoint: ${status}\n`);
      if (status === 'FAIL') return yield* Effect.fail(new CheckpointFailed());
    }),
);

Command.run(checkpointCommand, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
