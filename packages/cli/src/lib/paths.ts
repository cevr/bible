import { join } from 'path';

/**
 * Get the CLI root directory.
 * At compile time, BIBLE_CLI_ROOT is embedded with the absolute path.
 * Falls back to process.cwd() for development.
 */
export const getCliRoot = (): string => process.env['BIBLE_CLI_ROOT'] ?? process.cwd();

/**
 * Get path to outputs directory
 */
export const getOutputsPath = (...segments: string[]): string =>
  join(getCliRoot(), 'outputs', ...segments);
