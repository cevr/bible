/* oxlint-disable effect/noNodeBuiltinImport -- build tooling, not portable runtime core: this suite creates real SQLite files in a temp directory to drive `bun:sqlite`'s own failures, which is the whole point of it. */

/** The vector compiler's source read, at its failure edges (round-2 F15).
 *
 *  `readVectorSource` had no test at all. Its two deliberate design decisions —
 *  failures land on a typed error channel rather than collapsing into an empty
 *  corpus, and the database handle is an `acquireUseRelease` resource so it
 *  closes on *every* exit — are both invisible on the happy path. A regression
 *  in either one produces a build that either debugs in the wrong place ("your
 *  database is empty" when the fault is the query) or leaks a read handle and a
 *  WAL on a 4.5 GB file.
 *
 *  Real SQLite databases in a temp directory rather than a driver double: what
 *  is under test is how this code behaves against `bun:sqlite`'s actual errors —
 *  an unopenable path, a missing table, a renamed column — and a double would
 *  only assert that the test can imitate them.
 */

import { EGW_SCOPE_AUTHORS } from '@bible/core/writings';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';
import { Effect, Option } from 'effect';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readVectorSource, VectorSourceError } from './source.js';

/** One temp directory for the file, left for the OS to reclaim.
 *
 *  No `afterAll`: these are a handful of kilobyte databases under `os.tmpdir()`,
 *  and a cleanup hook would be a lifecycle this suite does not otherwise need. */
const workspace = mkdtempSync(path.join(tmpdir(), 'bible-vector-source-'));

const AUTHOR = EGW_SCOPE_AUTHORS[0] ?? 'Ellen Gould White';

/** A corpus-shaped database. `paraIdType` lets one test declare a column type
 *  the decoder rejects, so the *decoder* — rather than the query — is what
 *  fails. */
const makeDatabase = (input: {
  readonly name: string;
  readonly rows?: readonly {
    readonly bookCode: string;
    /** `None` writes SQL NULL — the corpus's own "no identity" state, which is
     *  one of the rows §9.2 must drop. */
    readonly paraId: Option.Option<string>;
    readonly refcodeShort: Option.Option<string>;
    readonly text: string;
  }[];
  readonly paraIdType?: string;
}): string => {
  const filename = path.join(workspace, input.name);
  const database = new Database(filename);
  database.exec(`
    CREATE TABLE books (book_id INTEGER PRIMARY KEY, book_code TEXT NOT NULL, book_author TEXT NOT NULL);
    CREATE TABLE paragraphs (
      book_id INTEGER NOT NULL,
      ref_code TEXT NOT NULL,
      para_id ${input.paraIdType ?? 'TEXT'},
      refcode_short TEXT,
      content_text TEXT NOT NULL,
      puborder INTEGER NOT NULL
    );
  `);
  const book = database.prepare(
    'INSERT INTO books (book_id, book_code, book_author) VALUES (?,?,?)',
  );
  const paragraph = database.prepare(
    'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (?,?,?,?,?,?)',
  );
  const codes = new Map<string, number>();
  (input.rows ?? []).forEach((row, order) => {
    if (!codes.has(row.bookCode)) {
      const id = codes.size + 1;
      codes.set(row.bookCode, id);
      book.run(id, row.bookCode, AUTHOR);
    }
    paragraph.run(
      codes.get(row.bookCode) ?? 1,
      `${row.bookCode} ${String(order)}`,
      Option.getOrNull(row.paraId),
      Option.getOrNull(row.refcodeShort),
      row.text,
      order,
    );
  });
  database.close();
  return filename;
};

/** `Result` rather than `Exit`: `readVectorSource` declares exactly one error
 *  type, so the failure side *is* a `VectorSourceError` and the test can read
 *  its message directly rather than picking through a cause. */
const run = (filename: string, limit = Option.none<number>()) =>
  Effect.runSync(Effect.result(readVectorSource({ filename, limit })));

describe('readVectorSource — failures reach the error channel (F15)', () => {
  it('fails rather than reporting an empty corpus when the file cannot be opened', () => {
    // The distinction the tagged error exists for: "no such file" and "no
    // EGW-scope paragraphs in this file" are different problems, and the
    // previous shape reported both as the second one.
    const outcome = run(path.join(workspace, 'does-not-exist.db'));

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag !== 'Failure') return;
    expect(outcome.failure).toBeInstanceOf(VectorSourceError);
    expect(outcome.failure.message).toContain('cannot open');
  });

  it('fails when the query cannot run against the schema', () => {
    // A database that opens fine and has no `paragraphs` table at all: the
    // failure is in the query, and an empty array would point the operator at
    // the corpus instead.
    const filename = path.join(workspace, 'no-tables.db');
    new Database(filename).close();

    const outcome = run(filename);

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag !== 'Failure') return;
    expect(outcome.failure).toBeInstanceOf(VectorSourceError);
    expect(outcome.failure.message).toContain('query failed');
  });

  it('fails when a column holds a type the decoder rejects', () => {
    // The schema-break case, which is the one §9.2 most needs to stop a build
    // for: the query succeeds, the rows come back, and `para_id` is a number
    // where the decoder requires a string-or-null. Writing an index from this
    // would key vectors by a value the fusion cannot join back.
    const filename = makeDatabase({
      name: 'bad-schema.db',
      paraIdType: 'INTEGER',
      rows: [
        {
          bookCode: 'GC',
          paraId: Option.none(),
          refcodeShort: Option.some('GC 425.1'),
          text: 'the sanctuary',
        },
      ],
    });
    const database = new Database(filename);
    database
      .prepare(
        'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (1, ?, 12345, ?, ?, 99)',
      )
      .run('GC 1', 'GC 1.1', 'a paragraph');
    database.close();

    const outcome = run(filename);

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag !== 'Failure') return;
    expect(outcome.failure.message).toContain('unexpected paragraphs schema');
  });
});

describe('readVectorSource — the handle is released on every exit (F15)', () => {
  /** Counts `close()` on every database this module opens.
   *
   *  Observing the call rather than a filesystem side effect, because there is
   *  no side effect to observe: SQLite lets a second connection create and drop
   *  tables while a `readonly` handle is still open, so a probe that tried to
   *  write would report "released" for a leaked handle and could never fail.
   *  What `acquireUseRelease` promises is precisely that `close()` runs on every
   *  exit, so that is what is counted.
   *
   *  `Database.prototype` is patched for the duration and restored after, so the
   *  instrumentation cannot outlive the assertion. */
  /** Runs `readVectorSource` with `Database.prototype.close` counted.
   *
   *  Observing the call rather than a filesystem side effect, because there is
   *  no side effect to observe: SQLite lets a second connection create and drop
   *  tables while a `readonly` handle is still open, so a probe that tried to
   *  write would report "released" for a leaked handle and could never fail.
   *  What `acquireUseRelease` promises is exactly that `close()` runs on every
   *  exit, so that is what is counted.
   *
   *  `Effect.acquireUseRelease` restores the prototype, so the instrumentation
   *  cannot outlive the assertion even if the read dies. */
  const countingCloses = (filename: string) =>
    Effect.runSync(
      Effect.acquireUseRelease(
        Effect.sync(() => {
          const original = Database.prototype.close;
          const counter = { closes: 0, original };
          Database.prototype.close = function patched(this: Database, ...args: readonly unknown[]) {
            counter.closes += 1;
            return (original as (...rest: readonly unknown[]) => unknown).apply(this, args);
          } as typeof Database.prototype.close;
          return counter;
        }),
        (counter) => Effect.sync(() => ({ outcome: run(filename), closes: counter.closes })),
        (counter) =>
          Effect.sync(() => {
            Database.prototype.close = counter.original;
          }),
      ),
    );

  it('releases the database after a successful read', () => {
    const filename = makeDatabase({
      name: 'success.db',
      rows: [
        {
          bookCode: 'GC',
          paraId: Option.some('14879.1'),
          refcodeShort: Option.some('GC 425.1'),
          text: 'the sanctuary',
        },
      ],
    });

    const probe = countingCloses(filename);

    expect(probe.outcome._tag).toBe('Success');
    expect(probe.closes).toBe(1);
  });

  it('releases the database when the decode fails', () => {
    // The path the previous shape leaked: the handle was closed on the success
    // branch only, so a decode failure left it open. This is the assertion that
    // distinguishes `acquireUseRelease` from a trailing `close()`.
    const filename = makeDatabase({ name: 'release-on-failure.db', paraIdType: 'INTEGER' });
    const database = new Database(filename);
    database.exec(
      `INSERT INTO books (book_id, book_code, book_author) VALUES (1, 'GC', '${AUTHOR}')`,
    );
    database
      .prepare(
        'INSERT INTO paragraphs (book_id, ref_code, para_id, refcode_short, content_text, puborder) VALUES (1, ?, 42, ?, ?, 0)',
      )
      .run('GC 1', 'GC 1.1', 'a paragraph');
    database.close();

    const probe = countingCloses(filename);

    expect(probe.outcome._tag).toBe('Failure');
    expect(probe.closes).toBe(1);
  });

  it('releases the database when the query fails', () => {
    const filename = path.join(workspace, 'release-on-query-failure.db');
    new Database(filename).close();

    const probe = countingCloses(filename);

    expect(probe.outcome._tag).toBe('Failure');
    expect(probe.closes).toBe(1);
  });
});

describe('readVectorSource — which rows become vectors (F15)', () => {
  it('drops rows with no identity and no text, and keeps the rest', () => {
    // Three exclusions §9.2 depends on, none of which is an error: a row with
    // no `para_id` cannot be joined back, a row with no refcode cannot be
    // displayed, and a structural row with no text would put a meaningless
    // vector into the scan.
    const filename = makeDatabase({
      name: 'filtering.db',
      rows: [
        {
          bookCode: 'GC',
          paraId: Option.some('1.1'),
          refcodeShort: Option.some('GC 425.1'),
          text: 'the sanctuary',
        },
        {
          bookCode: 'GC',
          paraId: Option.none(),
          refcodeShort: Option.some('GC 425.2'),
          text: 'no identity',
        },
        {
          bookCode: 'GC',
          paraId: Option.some('1.3'),
          refcodeShort: Option.some('GC 425.3'),
          text: '   ',
        },
        {
          bookCode: 'DA',
          paraId: Option.some('2.1'),
          refcodeShort: Option.none(),
          text: 'falls back to ref_code',
        },
      ],
    });

    const outcome = run(filename);

    expect(outcome._tag).toBe('Success');
    if (outcome._tag !== 'Success') return;
    // Ordered by `(book_code, puborder)` — which is what makes a rebuild over
    // unchanged input produce an identical digest — so `DA` precedes `GC`.
    expect(outcome.success.map((row) => row.paraId)).toEqual(['2.1', '1.1']);
    // The refcode falls back to `ref_code` when `refcode_short` is absent.
    expect(outcome.success[0]?.refcode).toBe('DA 3');
  });

  it('honours --limit, which is what keeps a test off the full corpus', () => {
    const filename = makeDatabase({
      name: 'limited.db',
      rows: Array.from({ length: 5 }, (_value, index) => ({
        bookCode: 'GC',
        paraId: Option.some(`1.${String(index)}`),
        refcodeShort: Option.some(`GC 425.${String(index)}`),
        text: 'the sanctuary',
      })),
    });

    const outcome = run(filename, Option.some(2));

    expect(outcome._tag).toBe('Success');
    if (outcome._tag !== 'Success') return;
    expect(outcome.success.length).toBe(2);
  });
});
