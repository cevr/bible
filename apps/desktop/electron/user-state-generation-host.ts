/** Synchronous native filesystem boundary used inside Effect.try transactions. */
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const digest = (input: string | Uint8Array): string =>
  createHash('sha256').update(input).digest('hex');

export const databaseFingerprint = (filename: string, bytes: Uint8Array): string => {
  const hash = createHash('sha256').update(bytes);
  const wal = `${filename}-wal`;
  if (existsSync(wal)) hash.update(readFileSync(wal));
  return `sha256:${hash.digest('hex')}`;
};

export const exists = existsSync;
export const readBytes = (filename: string): Uint8Array => readFileSync(filename);
export const readText = (filename: string): string => readFileSync(filename, 'utf8');
export const entries = readdirSync;
export const rename = renameSync;
export const unlink = unlinkSync;
export const writeText = (filename: string, contents: string): void =>
  writeFileSync(filename, contents, 'utf8');
export const join = path.join;
