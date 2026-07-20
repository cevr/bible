import { Effect } from 'effect';

import type { CheckpointName, CheckResult } from './model.js';
import { checkpointIndex } from './model.js';

type ReadText = (path: string) => Effect.Effect<string, unknown>;
type GlobFiles = (pattern: string) => Effect.Effect<readonly string[], unknown>;
type ReadDependencyVersions = (path: string) => Effect.Effect<ReadonlyMap<string, string>, unknown>;

const extractModuleSpecifiers = (source: string): readonly string[] => {
  const specifiers = new Set<string>();
  const patterns = [
    /(?:from\s+|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*['"]([^'"]+)['"]/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.add(specifier);
    }
  }

  return [...specifiers];
};

const scanImports = (options: {
  readonly title: string;
  readonly patterns: readonly string[];
  readonly forbidden: (specifier: string) => boolean;
  readonly globFiles: GlobFiles;
  readonly readText: ReadText;
  readonly displayPath: (path: string) => string;
}): Effect.Effect<CheckResult, unknown> =>
  Effect.gen(function* () {
    const violations: string[] = [];

    yield* Effect.forEach(
      options.patterns,
      (pattern) =>
        options.globFiles(pattern).pipe(
          Effect.flatMap((paths) =>
            Effect.forEach(
              paths,
              (path) =>
                options.readText(path).pipe(
                  Effect.tap((source) =>
                    Effect.sync(() => {
                      for (const specifier of extractModuleSpecifiers(source)) {
                        if (options.forbidden(specifier)) {
                          violations.push(`${options.displayPath(path)} imports ${specifier}`);
                        }
                      }
                    }),
                  ),
                ),
              { concurrency: 1, discard: true },
            ),
          ),
        ),
      { concurrency: 1, discard: true },
    );

    let status: CheckResult['status'] = 'fail';
    let details: readonly string[] = violations.sort();
    if (violations.length === 0) {
      status = 'pass';
      details = ['no forbidden imports'];
    }
    return {
      name: options.title,
      status,
      details,
    };
  });

const scanSourcePattern = (options: {
  readonly title: string;
  readonly patterns: readonly string[];
  readonly forbidden: RegExp;
  readonly globFiles: GlobFiles;
  readonly readText: ReadText;
  readonly displayPath: (path: string) => string;
}): Effect.Effect<CheckResult, unknown> =>
  Effect.gen(function* () {
    const violations: string[] = [];
    yield* Effect.forEach(
      options.patterns,
      (pattern) =>
        options.globFiles(pattern).pipe(
          Effect.flatMap((paths) =>
            Effect.forEach(
              paths,
              (path) =>
                options.readText(path).pipe(
                  Effect.tap((source) => {
                    if (!options.forbidden.test(source)) return Effect.void;
                    return Effect.sync(() => violations.push(options.displayPath(path)));
                  }),
                ),
              { concurrency: 1, discard: true },
            ),
          ),
        ),
      { concurrency: 1, discard: true },
    );
    let status: CheckResult['status'] = 'fail';
    let details: readonly string[] = violations.sort();
    if (violations.length === 0) {
      status = 'pass';
      details = ['no forbidden source patterns'];
    }
    return {
      name: options.title,
      status,
      details,
    };
  });

export const dynamicImportPattern = /(?<![.$\w])import\s*\(/u;

const dependencyCheck = (
  name: string,
  failures: readonly string[],
  success: string,
): CheckResult => {
  if (failures.length === 0) return { name, status: 'pass', details: [success] };
  return { name, status: 'fail', details: failures };
};

const requireDependency = (
  dependencies: ReadonlyMap<string, string>,
  manifest: string,
  name: string,
  failures: string[],
  displayPath: (path: string) => string,
): void => {
  if (!dependencies.has(name)) failures.push(`${displayPath(manifest)} must depend on ${name}`);
};

const forbidDependencies = (
  dependencies: ReadonlyMap<string, string>,
  manifest: string,
  names: readonly string[],
  failures: string[],
  displayPath: (path: string) => string,
): void => {
  for (const name of names) {
    if (dependencies.has(name))
      failures.push(`${displayPath(manifest)} must not depend on ${name}`);
  }
};

export const checkBoundaries = (options: {
  readonly checkpoint: CheckpointName;
  readonly globFiles: GlobFiles;
  readonly readText: ReadText;
  readonly readDependencyVersions: ReadDependencyVersions;
  readonly displayPath: (path: string) => string;
}): Effect.Effect<readonly CheckResult[], unknown> =>
  Effect.gen(function* () {
    const results: CheckResult[] = [];
    const foundationReached = checkpointIndex(options.checkpoint) >= checkpointIndex('foundation');
    const sharedAppReached = checkpointIndex(options.checkpoint) >= checkpointIndex('shared-app');
    const preCutoverReached = checkpointIndex(options.checkpoint) >= checkpointIndex('pre-cutover');

    results.push(
      yield* scanImports({
        title: 'core import direction',
        patterns: ['packages/core/src/**/*.{ts,tsx}'],
        forbidden: (specifier) =>
          specifier === 'solid-js' ||
          specifier.startsWith('solid-js/') ||
          specifier.startsWith('@solidjs/') ||
          specifier === 'react' ||
          specifier.startsWith('react/') ||
          specifier === 'electron' ||
          specifier.startsWith('@bible/app') ||
          specifier.startsWith('@bible/web') ||
          specifier.startsWith('@bible/desktop') ||
          specifier.includes('/apps/'),
        globFiles: options.globFiles,
        readText: options.readText,
        displayPath: options.displayPath,
      }),
    );

    if (sharedAppReached) {
      results.push(
        yield* scanImports({
          title: 'shared app import direction',
          patterns: ['packages/app/src/**/*.{ts,tsx}'],
          forbidden: (specifier) =>
            specifier === 'electron' ||
            specifier.startsWith('node:') ||
            specifier === 'better-sqlite3' ||
            specifier === 'wa-sqlite' ||
            specifier.startsWith('wa-sqlite/') ||
            specifier === 'drizzle-orm' ||
            specifier.startsWith('drizzle-orm/') ||
            specifier.startsWith('@effect/sql') ||
            specifier.startsWith('@bible/web') ||
            specifier.startsWith('@bible/desktop') ||
            specifier.includes('/apps/'),
          globFiles: options.globFiles,
          readText: options.readText,
          displayPath: options.displayPath,
        }),
        yield* scanSourcePattern({
          title: 'shared app dynamic import ban',
          patterns: ['packages/app/src/**/*.{ts,tsx}'],
          forbidden: dynamicImportPattern,
          globFiles: options.globFiles,
          readText: options.readText,
          displayPath: options.displayPath,
        }),
      );
    }

    if (preCutoverReached) {
      results.push(
        yield* scanSourcePattern({
          title: 'host dynamic import ban',
          patterns: ['apps/web/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
          forbidden: dynamicImportPattern,
          globFiles: options.globFiles,
          readText: options.readText,
          displayPath: options.displayPath,
        }),
      );
    }

    const core = yield* options.readDependencyVersions('packages/core/package.json');
    const cli = yield* options.readDependencyVersions('packages/cli/package.json');
    const web = yield* options.readDependencyVersions('apps/web/package.json');
    const desktop = yield* options.readDependencyVersions('apps/desktop/package.json');
    const dependencyFailures: string[] = [];

    if (foundationReached) {
      forbidDependencies(
        cli,
        'packages/cli/package.json',
        ['@opentui/core', '@opentui/core-darwin-arm64', '@opentui/solid', 'solid-js'],
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        core,
        'packages/core/package.json',
        'drizzle-orm',
        dependencyFailures,
        options.displayPath,
      );
      const drizzleVersion = core.get('drizzle-orm');
      if (drizzleVersion !== undefined && !drizzleVersion.includes('1.0.0-beta')) {
        dependencyFailures.push(
          `${options.displayPath('packages/core/package.json')} drizzle-orm must be 1.0.0-beta.x, found ${drizzleVersion}`,
        );
      }
    }

    if (sharedAppReached) {
      const app = yield* options.readDependencyVersions('packages/app/package.json');
      requireDependency(
        app,
        'packages/app/package.json',
        '@bible/core',
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        app,
        'packages/app/package.json',
        'solid-js',
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        web,
        'apps/web/package.json',
        '@bible/app',
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        desktop,
        'apps/desktop/package.json',
        '@bible/app',
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        web,
        'apps/web/package.json',
        'solid-js',
        dependencyFailures,
        options.displayPath,
      );
      requireDependency(
        desktop,
        'apps/desktop/package.json',
        'solid-js',
        dependencyFailures,
        options.displayPath,
      );

      for (const [manifest, dependencies] of [
        ['packages/app/package.json', app],
        ['apps/web/package.json', web],
        ['apps/desktop/package.json', desktop],
      ] as const) {
        const version = dependencies.get('solid-js');
        if (version !== undefined && !/(?:^|[^0-9])2\.0\.0-beta/u.test(version)) {
          dependencyFailures.push(
            `${options.displayPath(manifest)} solid-js must be 2.0.0-beta.x, found ${version}`,
          );
        }
      }
    }

    if (preCutoverReached) {
      forbidDependencies(
        web,
        'apps/web/package.json',
        [
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
        dependencyFailures,
        options.displayPath,
      );
    }

    results.push(
      dependencyCheck(
        'checkpoint dependency contract',
        dependencyFailures,
        `dependency contract satisfied for ${options.checkpoint}`,
      ),
    );

    return results;
  });
