declare const __BIBLE_CLI_ROOT__: string | undefined;

export const getCliRoot = (): string => {
  if (typeof __BIBLE_CLI_ROOT__ === 'string') {
    return __BIBLE_CLI_ROOT__;
  }
  const sourceSuffix = '/src/lib';
  if (import.meta.dir.endsWith(sourceSuffix)) {
    return import.meta.dir.slice(0, -sourceSuffix.length);
  }
  return import.meta.dir;
};

export const getOutputsPath = (...segments: string[]): string =>
  [getCliRoot(), 'outputs', ...segments].join('/');
