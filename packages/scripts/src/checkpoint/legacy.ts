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

type GlobFiles = (pattern: string) => Promise<readonly string[]>;
type ReadText = (path: string) => Promise<string>;
type ReadDependencies = (path: string) => Promise<ReadonlySet<string>>;

export const snapshotLegacy = async (options: {
  readonly globFiles: GlobFiles;
  readonly readText: ReadText;
  readonly readDependencies: ReadDependencies;
}): Promise<RemovalBaseline> => {
  const categories: LegacyCategorySnapshot[] = [];

  for (const category of LEGACY_CATEGORIES) {
    const matches = new Set<string>();

    for (const pattern of category.globs) {
      for (const path of await options.globFiles(pattern)) matches.add(path);
    }

    if (category.search !== undefined) {
      for (const pattern of category.searchGlobs ?? []) {
        for (const path of await options.globFiles(pattern)) {
          if (category.search.test(await options.readText(path))) matches.add(path);
        }
      }
    }

    for (const [manifest, names] of Object.entries(category.dependencies ?? {})) {
      const dependencies = await options.readDependencies(manifest);
      for (const name of names) {
        if (dependencies.has(name)) matches.add(`${manifest}#${name}`);
      }
    }

    categories.push({
      id: category.id,
      title: category.title,
      removalCheckpoint: category.removalCheckpoint,
      matches: [...matches].sort(),
    });
  }

  return { schemaVersion: 1, categories };
};

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
