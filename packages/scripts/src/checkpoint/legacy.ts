import { Effect } from 'effect';

import type {
  CheckpointName,
  LegacyCategory,
  LegacyCategorySnapshot,
  RemovalBaseline,
} from './model.js';
import { checkpointIndex, displayLegacyMatch } from './model.js';

export const LEGACY_CATEGORIES: readonly LegacyCategory[] = [
  {
    id: 'cli-tui',
    title: 'CLI TUI and interactive reader',
    removalCheckpoint: 'foundation',
    globs: [
      'packages/cli/src/tui/**/*',
      'packages/cli/test/tui/**/*',
      'packages/cli/test/lib/tui-harness.ts',
      'packages/cli/test/lib/mock-interactive-reader.ts',
      'packages/cli/src/services/interactive-reader.ts',
      'packages/cli/src/app/reader-reference.ts',
      'packages/cli/src/lib/parse-reader-reference.ts',
      'packages/cli/src/commands/egw/open.ts',
    ],
    search: /InteractiveReader|parseReaderReference|commands\/egw\/open/u,
    searchGlobs: ['packages/cli/src/**/*.ts', 'packages/cli/test/**/*.ts'],
    dependencies: {
      'packages/cli/package.json': [
        '@opentui/core',
        '@opentui/core-darwin-arm64',
        '@opentui/solid',
        'solid-js',
      ],
    },
  },
  {
    id: 'web-react',
    title: 'React web application and React-only libraries',
    removalCheckpoint: 'pre-cutover',
    globs: [],
    search:
      /(?:from\s+|import\s*\()(['"])(?:react|react-dom|react-router|@base-ui\/react|cmdk|lucide-react|react-resizable-panels|@vitejs\/plugin-react)(?:\/[^'"]*)?\1/u,
    searchGlobs: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
    dependencies: {
      'apps/web/package.json': [
        '@base-ui/react',
        '@hookform/resolvers',
        'cmdk',
        'embla-carousel-react',
        'input-otp',
        'lucide-react',
        'react',
        'react-day-picker',
        'react-dom',
        'react-hook-form',
        'react-resizable-panels',
        'react-router',
        'recharts',
        'sonner',
        'vaul',
        '@types/react',
        '@types/react-dom',
        '@vitejs/plugin-react',
        'babel-plugin-react-compiler',
      ],
    },
  },
  {
    id: 'web-cache-providers',
    title: 'Legacy web caches, providers, and renderer database client',
    removalCheckpoint: 'pre-cutover',
    globs: [
      'apps/web/src/lib/cache.ts',
      'apps/web/src/lib/cached-app.ts',
      'apps/web/src/providers/**/*',
      'apps/web/src/data/service-client.ts',
      'apps/web/src/data/db-client-service.ts',
      'apps/web/src/workers/db-client.ts',
      'apps/web/src/workers/db-protocol.ts',
    ],
  },
  {
    id: 'desktop-ipc-cache',
    title: 'Legacy desktop IPC cache and domain procedure facade',
    removalCheckpoint: 'pre-cutover',
    globs: [
      'apps/desktop/src/ipc-cache/**/*',
      'apps/desktop/src/procedures.ts',
      'apps/desktop/electron/ipc-contract.ts',
      'apps/desktop/electron/ipc/**/*',
    ],
  },
  {
    id: 'duplicate-route-trees',
    title: 'Host-owned route trees and reader-mode routing',
    removalCheckpoint: 'pre-cutover',
    globs: [
      'apps/web/src/routes/**/*',
      'apps/desktop/src/services/url-state-router.ts',
      'apps/desktop/src/components/modes/**/*',
    ],
  },
  {
    id: 'host-domain-workflows',
    title: 'Host-owned domain data and workflow modules',
    removalCheckpoint: 'pre-cutover',
    globs: ['apps/web/src/data/**/*', 'apps/desktop/src/services/**/*'],
  },
  {
    id: 'shared-platform-discriminators',
    title: 'Broad platform discriminators in the shared application',
    removalCheckpoint: 'shared-app',
    globs: [],
    search: /platform\s*(?:===|!==)|switch\s*\(\s*platform\s*\)|\bis(?:Web|Desktop)\b/u,
    searchGlobs: ['packages/app/src/**/*.{ts,tsx}'],
  },
] as const;

type GlobFiles = (pattern: string) => Effect.Effect<readonly string[], unknown>;
type ReadText = (path: string) => Effect.Effect<string, unknown>;
type ReadDependencies = (path: string) => Effect.Effect<ReadonlySet<string>, unknown>;

const GENERATED_PATH_SEGMENTS = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
]);

export const isRepositorySourcePath = (path: string): boolean =>
  path.split('/').every((segment) => !GENERATED_PATH_SEGMENTS.has(segment));

export const snapshotLegacy = (options: {
  readonly globFiles: GlobFiles;
  readonly readText: ReadText;
  readonly readDependencies: ReadDependencies;
}): Effect.Effect<RemovalBaseline, unknown> =>
  Effect.gen(function* () {
    const categories: LegacyCategorySnapshot[] = [];

    yield* Effect.forEach(
      LEGACY_CATEGORIES,
      (category) =>
        Effect.gen(function* () {
          const matches = new Set<string>();

          yield* Effect.forEach(
            category.globs,
            (pattern) =>
              options.globFiles(pattern).pipe(
                Effect.tap((paths) =>
                  Effect.sync(() => {
                    for (const path of paths) {
                      if (isRepositorySourcePath(path)) matches.add(path);
                    }
                  }),
                ),
              ),
            { concurrency: 1, discard: true },
          );

          const search = category.search;
          if (search !== undefined) {
            yield* Effect.forEach(
              category.searchGlobs ?? [],
              (pattern) =>
                options.globFiles(pattern).pipe(
                  Effect.flatMap((paths) =>
                    Effect.forEach(
                      paths,
                      (path) => {
                        if (!isRepositorySourcePath(path)) return Effect.void;
                        return options.readText(path).pipe(
                          Effect.tap((source) => {
                            if (!search.test(source)) return Effect.void;
                            return Effect.sync(() => matches.add(path));
                          }),
                        );
                      },
                      { concurrency: 1, discard: true },
                    ),
                  ),
                ),
              { concurrency: 1, discard: true },
            );
          }

          yield* Effect.forEach(
            Object.entries(category.dependencies ?? {}),
            ([manifest, names]) =>
              options.readDependencies(manifest).pipe(
                Effect.tap((dependencies) =>
                  Effect.sync(() => {
                    for (const name of names) {
                      if (dependencies.has(name)) matches.add(`${manifest}#${name}`);
                    }
                  }),
                ),
              ),
            { concurrency: 1, discard: true },
          );

          categories.push({
            id: category.id,
            title: category.title,
            removalCheckpoint: category.removalCheckpoint,
            matches: [...matches].sort(),
          });
        }),
      { concurrency: 1, discard: true },
    );

    return { schemaVersion: 1, categories };
  });

export const validateLegacySnapshot = (
  checkpoint: CheckpointName,
  baseline: RemovalBaseline,
  current: RemovalBaseline,
  root?: string,
): readonly string[] => {
  const failures: string[] = [];
  const baselineById = new Map(baseline.categories.map((category) => [category.id, category]));

  for (const category of current.categories) {
    const original = baselineById.get(category.id);
    if (original === undefined) {
      failures.push(`legacy category ${category.id} is absent from the initial baseline`);
      continue;
    }

    if (category.matches.length > original.matches.length) {
      failures.push(
        `${category.title} grew from ${String(original.matches.length)} to ${String(category.matches.length)} targets`,
      );
    }

    if (
      checkpointIndex(checkpoint) >= checkpointIndex(category.removalCheckpoint) &&
      category.matches.length > 0
    ) {
      failures.push(
        `${category.title} must be absent by ${category.removalCheckpoint}: ${category.matches.map((match) => displayLegacyMatch(match, root)).join(', ')}`,
      );
    }
  }

  return failures;
};
