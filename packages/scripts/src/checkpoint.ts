#!/usr/bin/env bun

import { join, relative } from 'node:path';

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
import { renderCheckpointReport } from './checkpoint/report.js';

const ROOT = join(import.meta.dir, '../../..');
const CHECKPOINTS_DIR = join(ROOT, 'docs/architecture/checkpoints');
const INVENTORIES_DIR = join(ROOT, 'docs/architecture/inventories');
const BASELINE_PATH = join(INVENTORIES_DIR, 'removal-baseline.json');

interface JsonObject {
  readonly [key: string]: unknown;
}

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJsonObject = async (path: string): Promise<JsonObject> => {
  const value: unknown = await Bun.file(path).json();
  if (!isJsonObject(value)) throw new Error(`${relative(ROOT, path)} must contain a JSON object`);
  return value;
};

const dependencyVersions = async (path: string): Promise<ReadonlyMap<string, string>> => {
  const manifest = await readJsonObject(join(ROOT, path));
  const rootManifest = await readJsonObject(join(ROOT, 'package.json'));
  const catalog = isJsonObject(rootManifest['catalog']) ? rootManifest['catalog'] : {};
  const entries: [string, string][] = [];

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const dependencies = manifest[field];
    if (!isJsonObject(dependencies)) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== 'string') continue;
      const catalogVersion = catalog[name];
      entries.push([
        name,
        version === 'catalog:' && typeof catalogVersion === 'string' ? catalogVersion : version,
      ]);
    }
  }

  return new Map(entries);
};

const dependencyNames = async (path: string): Promise<ReadonlySet<string>> =>
  new Set((await dependencyVersions(path)).keys());

const globFiles = async (pattern: string): Promise<readonly string[]> => {
  const paths: string[] = [];
  const glob = new Bun.Glob(pattern);
  for await (const path of glob.scan({ cwd: ROOT, dot: true, onlyFiles: true })) paths.push(path);
  return paths.sort();
};

const readText = (path: string): Promise<string> => Bun.file(join(ROOT, path)).text();

const parseRemovalBaseline = (value: unknown): RemovalBaseline => {
  if (!isJsonObject(value) || value['schemaVersion'] !== 1 || !Array.isArray(value['categories'])) {
    throw new Error('removal-baseline.json does not match schema version 1');
  }

  const categories = value['categories'].map((category): RemovalBaseline['categories'][number] => {
    const removalCheckpoint = isJsonObject(category) ? category['removalCheckpoint'] : undefined;
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
      throw new Error('removal-baseline.json contains an invalid category');
    }

    return {
      id: category['id'],
      title: category['title'],
      removalCheckpoint,
      matches: category['matches'],
    };
  });

  return { schemaVersion: 1, categories };
};

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

const runCommand = async (command: readonly string[]): Promise<CommandResult> => {
  process.stdout.write(`\n$ ${command.join(' ')}\n`);
  const child = Bun.spawn([...command], {
    cwd: ROOT,
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return { command, exitCode: await child.exited };
};

const staticResult = (name: string, failures: readonly string[], success: string): CheckResult => ({
  name,
  status: failures.length === 0 ? 'pass' : 'fail',
  details: failures.length === 0 ? [success] : failures,
});

const writeJson = (path: string, value: unknown): Promise<number> =>
  Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);

const main = async (): Promise<void> => {
  const requested = Bun.argv.slice(2).find((argument) => argument !== '--') ?? '';
  if (!isCheckpointName(requested)) {
    throw new Error(`checkpoint must be one of: ${CHECKPOINT_NAMES.join(', ')}`);
  }

  await Promise.all([
    Bun.file(join(ROOT, 'docs/architecture/solid-2-local-first-app.md'))
      .exists()
      .then((exists) => {
        if (!exists) throw new Error('accepted architecture brief is missing');
      }),
    Bun.file(join(INVENTORIES_DIR, 'persisted-stores.md'))
      .exists()
      .then((exists) => {
        if (!exists) throw new Error('persisted-store inventory is missing');
      }),
    Bun.file(join(ROOT, 'docs/architecture/feature-parity.md'))
      .exists()
      .then((exists) => {
        if (!exists) throw new Error('feature-parity matrix is missing');
      }),
  ]);

  const reviewedCommitProcess = Bun.spawn(['git', 'rev-parse', 'HEAD'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const reviewedCommit = (await new Response(reviewedCommitProcess.stdout).text()).trim();
  if ((await reviewedCommitProcess.exited) !== 0 || reviewedCommit === '') {
    throw new Error('unable to resolve reviewed commit');
  }

  const commandResults: CommandResult[] = [];
  for (const command of commandsFor(requested)) commandResults.push(await runCommand(command));

  const currentLegacy = await snapshotLegacy({
    globFiles,
    readText,
    readDependencies: dependencyNames,
  });
  let baseline: RemovalBaseline;
  if (await Bun.file(BASELINE_PATH).exists()) {
    baseline = parseRemovalBaseline(await Bun.file(BASELINE_PATH).json());
  } else {
    if (requested !== 'initial') throw new Error('initial removal baseline is missing');
    baseline = currentLegacy;
    await writeJson(BASELINE_PATH, baseline);
  }

  const checks = [
    ...(await checkBoundaries({
      checkpoint: requested,
      globFiles,
      readText,
      readDependencyVersions: dependencyVersions,
      displayPath: (path) => join(ROOT, path),
    })),
    staticResult(
      'initial removal inventory',
      requested === 'initial'
        ? currentLegacy.categories
            .filter(
              (category) =>
                category.id !== 'shared-platform-discriminators' && category.matches.length === 0,
            )
            .map((category) => `${category.title} has no identified removal targets`)
        : [],
      'every known legacy authority has a finite initial target list',
    ),
    staticResult(
      'legacy removal schedule',
      validateLegacySnapshot(requested, baseline, currentLegacy, ROOT),
      `${String(LEGACY_CATEGORIES.length)} legacy categories are bounded and on schedule`,
    ),
    staticResult(
      'checkpoint command suite',
      commandResults
        .filter((result) => result.exitCode !== 0)
        .map((result) => `${result.command.join(' ')} exited ${String(result.exitCode)}`),
      `${String(commandResults.length)} required command${commandResults.length === 1 ? '' : 's'} passed`,
    ),
  ];
  const status = checks.every((check) => check.status === 'pass') ? 'PASS' : 'FAIL';
  const report = renderCheckpointReport({
    checkpoint: requested,
    reviewedCommit,
    generatedAt: new Date().toISOString(),
    checks,
    commands: commandResults,
    currentLegacy,
    status,
    repositoryRoot: ROOT,
  });

  await Bun.write(join(CHECKPOINTS_DIR, `${requested}.md`), report);
  process.stdout.write(`\n${requested} architecture checkpoint: ${status}\n`);
  if (status === 'FAIL') process.exitCode = 1;
};

await main();
