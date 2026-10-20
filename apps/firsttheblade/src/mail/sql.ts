/**
 * The one thing the list's store needs from a database: a statement and its
 * values in, rows or a count of changed rows out. On Cloudflare it is the
 * Worker's D1 binding (`./sql-d1.ts`); in the tests and `bun run preview` it
 * is SQLite in memory with the same migrations (`./sql-sqlite.ts`), so the
 * tests run the statements the Worker runs.
 */
import { Context, type Effect, Schema } from 'effect';

export type SqlValue = string | number;

/**
 * A statement the database refused or could not run. It carries the
 * statement's name, never its values: they include addresses.
 */
export class SqlError extends Schema.TaggedError<SqlError>()('SqlError', {
  statement: Schema.String,
  reason: Schema.String,
}) {}

export interface SqlService {
  /** The rows a statement answers (a SELECT, or a write with RETURNING). */
  readonly all: (
    statement: Statement,
    values: ReadonlyArray<SqlValue>,
  ) => Effect.Effect<ReadonlyArray<unknown>, SqlError>;
  /** How many rows a write changed. */
  readonly run: (
    statement: Statement,
    values: ReadonlyArray<SqlValue>,
  ) => Effect.Effect<number, SqlError>;
}

/** A statement and the name logs and errors call it by. */
export interface Statement {
  readonly name: string;
  readonly text: string;
}

export class Sql extends Context.Service<Sql, SqlService>()('firsttheblade/Sql') {}

/** The reason a database threw, as words that name no value. */
export const reasonOf = (cause: unknown) => {
  if (cause instanceof Error) return cause.message.slice(0, 200);
  return 'unknown';
};
