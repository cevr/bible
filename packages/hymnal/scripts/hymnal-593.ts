/**
 * Writes hymn 593 ("In Times Like These") into hymnal.db in the layout the
 * compiler reads, every printed word kept:
 *
 *   bun packages/hymnal/scripts/hymnal-593.ts [--db <hymnal.db>]
 *
 * Its source is `data/fixes/593.json`, the hymn as its engraving prints it,
 * each line with where it was read: three stanzas and a refrain whose last
 * two lines are printed twice, one ending for stanzas 1 and 2 ("Be very sure
 * ... Your anchor") and one for stanza 3 ("I'm very sure ... My anchor"). No
 * single refrain fits all three, so each stanza is written with the refrain
 * sung after it, its own ending last, as ids 0, 1 and 2, and the hymn has no
 * refrain of its own. The output depends on the source alone, so a rerun
 * writes the same row. `--db` is read against the working directory; a
 * missing file is refused, never created.
 */

import { Database } from 'bun:sqlite';
import { Schema } from 'effect';
import path from 'node:path';

const NUMBER = 593;

const Lines = Schema.Array(Schema.Struct({ text: Schema.String, from: Schema.String }));
const Printed = Schema.fromJsonString(
  Schema.Struct({
    number: Schema.Literal(NUMBER),
    stanzas: Schema.Array(Lines),
    refrain: Schema.Struct({
      lines: Lines,
      endings: Schema.Array(Schema.Struct({ after: Schema.Array(Schema.Int), lines: Lines })),
    }),
  }),
);
const Verses = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
);

/** The row's verses as the compiler reads them: stanza n as id n - 1, the refrain and its ending after it. */
const inline = (printed: typeof Printed.Type): typeof Verses.Type =>
  printed.stanzas.map((stanza, n) => {
    const ending = printed.refrain.endings.find((one) => one.after.includes(n + 1));
    if (ending === undefined)
      throw new Error(`hymn ${NUMBER}: no refrain ending for stanza ${n + 1}`);
    const lines = [...stanza, ...printed.refrain.lines, ...ending.lines];
    return { id: n, text: lines.map((line) => line.text).join('\n') };
  });

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--db');
  const file =
    at < 0
      ? path.resolve(import.meta.dir, '../../core/data/hymnal.db')
      : path.resolve(args[at + 1] ?? '');
  const printed = Schema.decodeSync(Printed)(
    await Bun.file(path.resolve(import.meta.dir, '../data/fixes/593.json')).text(),
  );
  const db = new Database(file, { create: false, readwrite: true });
  const before = db.query('SELECT verses FROM hymns WHERE id = ?').get(NUMBER);
  if (before === null) throw new Error(`hymn ${NUMBER} is not in ${file}`);
  const verses = Schema.encodeSync(Verses)(inline(printed));
  db.query('UPDATE hymns SET verses = ? WHERE id = ?').run(verses, NUMBER);
  db.close();
  console.log(`hymnal-593 wrote ids 0 1 2 (each stanza with its refrain) into ${file}`);
}
