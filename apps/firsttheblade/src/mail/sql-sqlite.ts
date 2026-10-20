/**
 * The list's database as SQLite in memory, for the tests and `bun run
 * preview`: Bun's own SQLite, with every migration in `migrations/` applied
 * in order, as Alchemy applies them to D1 on deploy. D1 is SQLite, so the
 * statements the store runs here are the ones it runs on Cloudflare.
 */
import { Database } from 'bun:sqlite';

import { Effect, FileSystem, Layer, Path } from 'effect';

import { batchName, reasonOf, Sql, SqlError, type Statement, type SqlValue } from './sql.ts';

/** The migrations folder beside `src/`. */
const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname;

const attempt = <A>(name: string, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) => SqlError.make({ statement: name, reason: reasonOf(cause) }),
  });

/** A fresh database in memory, migrated, for as long as the layer lives. */
export const layerSqlite = Layer.effect(
  Sql,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => new Database(':memory:', { strict: true })),
      (opened) => Effect.sync(() => opened.close()),
    );
    db.run('PRAGMA foreign_keys = ON');
    const files = (yield* fs.readDirectory(MIGRATIONS)).filter((file) => file.endsWith('.sql'));
    for (const file of files.toSorted()) {
      db.run(yield* fs.readFileString(path.join(MIGRATIONS, file)));
    }
    const bind = (values: ReadonlyArray<SqlValue>) => [...values];
    const write = (statement: Statement, values: ReadonlyArray<SqlValue>) =>
      db.query(statement.text).run(...bind(values)).changes;
    return Sql.of({
      all: (statement, values) =>
        attempt(statement.name, () => db.query(statement.text).all(...bind(values))),
      run: (statement, values) => attempt(statement.name, () => write(statement, values)),
      batch: (steps) =>
        attempt(batchName(steps), () =>
          db.transaction(() => steps.map((step) => write(step.statement, step.values)))(),
        ),
    });
  }),
);
