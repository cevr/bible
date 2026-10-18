/**
 * Writes each hymn whose hymnal.db row contradicts its printed page into
 * hymnal.db, from its printed source, every printed word kept:
 *
 *   bun packages/hymnal/scripts/hymnal-fixes.ts [--db <hymnal.db>]
 *
 * A printed source is `data/fixes/<NNN>.json`: the hymn as its page prints
 * it, each line with where it was read. Its refrain is a list of lines, and a
 * part of it that the page prints once for each stanza (`varies`, each with
 * the stanzas it follows) stands among them. The row is laid out as the
 * compiler reads it:
 *
 * - a refrain that varies: no single refrain fits every stanza, so each
 *   stanza is written with the refrain sung after it, its own part in place,
 *   as ids 0 to n - 1, and the hymn has no refrain of its own;
 * - a refrain that does not vary: the stanzas as ids 0 to n - 1 and the
 *   refrain as id -1 (where it is sung is `data/fixes/refrains.json`'s);
 * - no refrain: the stanzas as ids 0 to n - 1.
 *
 * Only the rows with a printed source are written. The output depends on the
 * sources alone, so a rerun writes the same rows. `--db` is read against the
 * working directory; a missing file is refused, never created.
 */

import { Database } from 'bun:sqlite';
import { Schema } from 'effect';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const Line = Schema.Struct({ text: Schema.String, from: Schema.String });
const Lines = Schema.Array(Line);
const Varies = Schema.Struct({
  varies: Schema.Array(Schema.Struct({ after: Schema.Array(Schema.Int), lines: Lines })),
});
const Printed = Schema.fromJsonString(
  Schema.Struct({
    number: Schema.Int,
    title: Schema.String,
    print: Schema.String,
    stanzas: Schema.Array(Lines),
    refrain: Schema.optionalKey(
      Schema.Struct({ lines: Schema.Array(Schema.Union([Line, Varies])) }),
    ),
  }),
);
type Printed = typeof Printed.Type;
const Verses = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
);

const textOf = (lines: ReadonlyArray<{ readonly text: string }>) =>
  lines.map((line) => line.text).join('\n');

/** The refrain's lines as sung after stanza `n` (1-based), its varying part resolved. */
const refrainAfter = (printed: Printed, n: number) =>
  (printed.refrain?.lines ?? []).flatMap((item) => {
    if (!('varies' in item)) return [item];
    const part = item.varies.find((one) => one.after.includes(n));
    if (part === undefined)
      throw new Error(`hymn ${printed.number}: no refrain part for stanza ${n}`);
    return part.lines;
  });

/** The row's verses as the compiler reads them. */
const versesOf = (printed: Printed): typeof Verses.Type => {
  const refrain = printed.refrain;
  if (refrain !== undefined && refrain.lines.some((item) => 'varies' in item))
    return printed.stanzas.map((stanza, n) => ({
      id: n,
      text: textOf([...stanza, ...refrainAfter(printed, n + 1)]),
    }));
  const stanzas = printed.stanzas.map((stanza, n) => ({ id: n, text: textOf(stanza) }));
  return refrain === undefined
    ? stanzas
    : [{ id: -1, text: textOf(refrainAfter(printed, 1)) }, ...stanzas];
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--db');
  const file =
    at < 0
      ? path.resolve(import.meta.dir, '../../core/data/hymnal.db')
      : path.resolve(args[at + 1] ?? '');
  const dir = path.resolve(import.meta.dir, '../data/fixes');
  const sources = readdirSync(dir)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .toSorted();
  const db = new Database(file, { create: false, readwrite: true });
  for (const name of sources) {
    const printed = Schema.decodeSync(Printed)(await Bun.file(path.join(dir, name)).text());
    if (`${String(printed.number).padStart(3, '0')}.json` !== name)
      throw new Error(`${name} prints hymn ${printed.number}`);
    const before = db.query('SELECT verses FROM hymns WHERE id = ?').get(printed.number);
    if (before === null) throw new Error(`hymn ${printed.number} is not in ${file}`);
    const verses = versesOf(printed);
    db.query('UPDATE hymns SET verses = ? WHERE id = ?').run(
      Schema.encodeSync(Verses)(verses),
      printed.number,
    );
    console.log(`hymnal-fixes ${printed.number} wrote ids ${verses.map((v) => v.id).join(' ')}`);
  }
  db.close();
}
