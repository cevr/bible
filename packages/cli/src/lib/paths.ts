import { join } from 'path';

declare const __BIBLE_CLI_ROOT__: string | undefined;

export const getCliRoot = (): string =>
  typeof __BIBLE_CLI_ROOT__ === 'string' ? __BIBLE_CLI_ROOT__ : process.cwd();

export const getOutputsPath = (...segments: string[]): string =>
  join(getCliRoot(), 'outputs', ...segments);
