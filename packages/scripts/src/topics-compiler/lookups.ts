import { Database } from 'bun:sqlite';
import { Effect, Option, Schema } from 'effect';

import type { CatalogLookup, ParagraphLookup } from './compile.js';

/** SQLite hands back untyped rows; these decode them into the shape the
 *  compiler relies on at the I/O boundary rather than narrowing them by hand
 *  at each use. A row that does not fit is dropped, which for a lookup means
 *  "no match" — and a missing citation or overlay is already a compile error
 *  raised by the caller with far better context than a decode failure here. */
const ContentRows = Schema.Array(Schema.Struct({ content_text: Schema.String }));
const IdRows = Schema.Array(Schema.Struct({ id: Schema.String }));
const ValueRows = Schema.Array(Schema.Struct({ value: Schema.String }));

const decodeContent = Schema.decodeUnknownOption(ContentRows);
const decodeIds = Schema.decodeUnknownOption(IdRows);
const decodeValues = Schema.decodeUnknownOption(ValueRows);

/** Resolves refcodes against the local writings database. `ref_code` and
 *  `refcode_short` are both indexed and both carry the form an author writes
 *  ("GC 425.1"), so either may match. */
export const openParagraphLookup = (filename: string): ParagraphLookup => {
  const database = new Database(filename, { readonly: true });
  const statement = database.prepare(
    'SELECT content_text FROM paragraphs WHERE ref_code = ? OR refcode_short = ?',
  );
  return {
    paragraphsFor: (refcode) =>
      Effect.sync(() => {
        const trimmed = refcode.trim();
        return decodeContent(statement.all(trimmed, trimmed)).pipe(
          Option.map((rows) => rows.map((row) => row.content_text)),
          Option.getOrElse((): readonly string[] => []),
        );
      }),
  };
};

/** Resolves catalog topic names against `bible.db`, case-insensitively per
 *  §2.4, and pins the revision it matched. `bible.db` carries no
 *  `corpus_revision` until it is installed through the supply pipeline, so a
 *  workspace copy falls back to its content hash — the pin's job is to detect
 *  drift, and a hash detects it exactly as well as a release tag would. */
export const openCatalogLookup = (filename: string): CatalogLookup => {
  const database = new Database(filename, { readonly: true });
  const revision = decodeValues(
    database
      .prepare("SELECT value FROM meta WHERE key IN ('corpus_revision', 'topics_source_hash')")
      .all(),
  ).pipe(
    Option.flatMap((rows) => Option.fromNullishOr(rows[0])),
    Option.map((row) => row.value),
    Option.getOrElse(() => 'unknown'),
  );
  const statement = database.prepare('SELECT id FROM topics WHERE lower(name) = lower(?)');
  return {
    revision,
    idsForName: (name) =>
      Effect.sync(() =>
        decodeIds(statement.all(name.trim())).pipe(
          Option.map((rows) => rows.map((row) => row.id)),
          Option.getOrElse((): readonly string[] => []),
        ),
      ),
  };
};
