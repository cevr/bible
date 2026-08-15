import { Option } from 'effect';

/** Populated at build time via a `globalThis.__BIBLE_CLI_ROOT__` define; absent in dev. */
type CliBuildGlobals = { readonly __BIBLE_CLI_ROOT__?: string };

export const getCliRoot = (): string =>
  Option.getOrElse(Option.fromNullishOr((globalThis as CliBuildGlobals).__BIBLE_CLI_ROOT__), () => {
    const sourceSuffix = '/src/lib';
    if (import.meta.dir.endsWith(sourceSuffix)) {
      return import.meta.dir.slice(0, -sourceSuffix.length);
    }
    return import.meta.dir;
  });

export const getOutputsPath = (...segments: string[]): string =>
  [getCliRoot(), 'outputs', ...segments].join('/');
