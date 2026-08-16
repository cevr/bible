import { Option } from 'effect';

/** Populated at build time via a `globalThis.__BIBLE_CLI_ROOT__` define; absent in dev. */
type CliBuildGlobals = { readonly __BIBLE_CLI_ROOT__?: string };

const buildRoot = (): Option.Option<string> =>
  Option.fromNullishOr((globalThis as CliBuildGlobals).__BIBLE_CLI_ROOT__);

const sourceRoot = (): string => {
  const sourceSuffix = '/src/lib';
  if (import.meta.dir.endsWith(sourceSuffix)) {
    return import.meta.dir.slice(0, -sourceSuffix.length);
  }
  return import.meta.dir;
};

export const getCliRoot = (): string => Option.getOrElse(buildRoot(), sourceRoot);

export const getOutputsPath = (...segments: string[]): string =>
  [getCliRoot(), 'outputs', ...segments].join('/');

/** The install-owned data slot, derived from the CLI root the same way
 *  `getOutputsPath` and the chime asset are. A caller's `process.cwd()` is not
 *  a location the CLI owns — an installed binary is run from anywhere — so a
 *  bundled artifact must be addressed relative to the binary's own root. Kept
 *  pure and parameterised on `cliRoot` so the derivation is unit-testable; the
 *  packaged install itself is only exercisable end to end. */
export const getDataPath = (cliRoot: string, ...segments: string[]): string =>
  [cliRoot, 'data', ...segments].join('/');

/** Where a compiled binary's bundled assets are: beside the executable.
 *
 *  `__BIBLE_CLI_ROOT__` is baked in at build time, so it names the *build
 *  machine's* checkout. That path is right only while the binary stays where it
 *  was compiled — copy it to another machine, install it into a prefix, or
 *  delete the checkout, and the define points at a directory that no longer
 *  exists. The executable's own location is the one thing that travels with the
 *  binary, so an installed copy resolves its data there first.
 *
 *  Order matters and is deliberate: exe-adjacent wins, because a binary that
 *  ships its own `data/` must use that copy rather than whatever happens to sit
 *  in a stale checkout. The build root is the fallback, which is what makes
 *  `bun src/main.ts` in the workspace keep working — there `process.execPath` is
 *  the Bun binary itself, and no `data/` sits beside it. */
export interface DataResolution {
  /** Directory of the running executable — `path.dirname(process.execPath)`. */
  readonly executableDir: string;
  /** The build-time root, absent in dev. */
  readonly buildRoot: Option.Option<string>;
  /** Whether a candidate directory holds the asset. Injected so the ordering
   *  rule is testable without touching a filesystem. */
  readonly exists: (candidate: string) => boolean;
}

/** The candidate data paths for one asset, in resolution order. Pure, so the
 *  order is a fact a test can assert rather than a behaviour only a packaged
 *  install could reveal. */
export const dataCandidates = (
  resolution: Pick<DataResolution, 'executableDir' | 'buildRoot'>,
  ...segments: string[]
): readonly string[] => [
  getDataPath(resolution.executableDir, ...segments),
  ...Option.match(resolution.buildRoot, {
    onNone: (): readonly string[] => [],
    onSome: (root) => [getDataPath(root, ...segments)],
  }),
];

/** The first candidate that exists, or the exe-adjacent path when none does —
 *  so a caller reporting a missing artifact names the location an install is
 *  expected to carry it, not a checkout the user may never have had. */
export const resolveDataPath = (resolution: DataResolution, ...segments: string[]): string => {
  const candidates = dataCandidates(resolution, ...segments);
  return Option.getOrElse(
    Option.fromNullishOr(candidates.find(resolution.exists)),
    () => candidates[0] ?? getDataPath(resolution.executableDir, ...segments),
  );
};

/** The running executable's directory. For a Bun-compiled binary this is where
 *  its `data/` sits; in dev it is wherever the `bun` binary lives, which is why
 *  the build root is still consulted as a fallback. */
export const executableDir = (): string =>
  process.execPath.slice(0, Math.max(0, process.execPath.lastIndexOf('/')));

/** The candidates for one packaged asset in the running process, in resolution
 *  order. The caller decides which exists — this module stays free of a
 *  filesystem so the ordering rule is a pure, tested fact. */
export const packagedDataCandidates = (...segments: string[]): readonly string[] =>
  dataCandidates({ executableDir: executableDir(), buildRoot: buildRoot() }, ...segments);
