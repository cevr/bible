/**
 * Writes hymn 593 ("In Times Like These") into hymnal.db in the layout the
 * compiler reads, every printed word kept:
 *
 *   bun packages/hymnal/scripts/hymnal-593.ts [--db <hymnal.db>]
 *
 * Its source is `data/fixes/593.json`, the row as hymnal.db first held it:
 * stanzas 1 to 3 at ids -3, -1 and 1, each followed by the refrain the print
 * sings after it (ids -2, 0 and 2). The refrain's last two lines change
 * after stanza 3 ("I'm very sure ... My anchor"), so no single refrain fits
 * all three: each stanza is written with its own refrain after it, as ids
 * 0, 1 and 2, and the hymn has no refrain of its own. The output depends on
 * the source alone, so a rerun writes the same row. `--db` is read against
 * the working directory; a missing file is refused, never created.
 */

import { Database } from 'bun:sqlite';
import { Schema } from 'effect';
import path from 'node:path';

const NUMBER = 593;
const LAYOUT = '-3 -2 -1 0 1 2';

const Verses = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
);
type Verses = typeof Verses.Type;

/** The row's verses as the compiler reads them: each stanza, ids 0, 1, 2, with the refrain sung after it. */
export const inline = (source: Verses): Verses => {
  const ids = source.map((verse) => verse.id).join(' ');
  if (ids !== LAYOUT) throw new Error(`hymn ${NUMBER}: source ids ${ids}, not ${LAYOUT}`);
  return [0, 1, 2].map((n) => ({
    id: n,
    text: `${source[2 * n]?.text ?? ''}\n${source[2 * n + 1]?.text ?? ''}`,
  }));
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--db');
  const file =
    at < 0
      ? path.resolve(import.meta.dir, '../../core/data/hymnal.db')
      : path.resolve(args[at + 1] ?? '');
  const source = Schema.decodeSync(Verses)(
    await Bun.file(path.resolve(import.meta.dir, '../data/fixes/593.json')).text(),
  );
  const db = new Database(file, { create: false, readwrite: true });
  const before = db.query('SELECT verses FROM hymns WHERE id = ?').get(NUMBER);
  if (before === null) throw new Error(`hymn ${NUMBER} is not in ${file}`);
  const verses = Schema.encodeSync(Verses)(inline(source));
  db.query('UPDATE hymns SET verses = ? WHERE id = ?').run(verses, NUMBER);
  db.close();
  console.log(`hymnal-593 wrote ids 0 1 2 (each stanza with its refrain) into ${file}`);
}
