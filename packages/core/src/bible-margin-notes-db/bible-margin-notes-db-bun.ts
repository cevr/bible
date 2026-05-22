/**
 * Bun-runtime layer constructors for BibleMarginNotesDatabase.
 *
 * Kept separate from `bible-margin-notes-db.ts` so Node-side consumers
 * (Electron main) can import the driver-agnostic core without pulling
 * `@effect/sql-sqlite-bun` (and its `bun:sqlite` import) into the bundle.
 */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Layer } from 'effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import { BibleMarginNotesDatabase } from './bible-margin-notes-db.js';

/**
 * Fixed-filename Bun layer. Caller is responsible for ensuring the parent
 * directory exists.
 */
export const layerBun = (filename: string): Layer.Layer<BibleMarginNotesDatabase, SqlError> =>
  BibleMarginNotesDatabase.layerCore.pipe(Layer.provide(SqliteBun.layer({ filename })));
