/**
 * Rewrites hymn 593 ("In Times Like These") in hymnal.db to the layout every
 * other hymn keeps: its stanzas as verse ids 0, 1, 2 in printed order, and
 * its refrain once, as id -1, ahead of them.
 *
 *   bun packages/hymnal/scripts/hymnal-593.ts [--db <hymnal.db>]
 *
 * The row came in interleaved: ids -3, -1 and 1 are stanzas 1 to 3, and ids
 * -2, 0 and 2 the refrain after each. The refrain is kept from id -2, as it
 * follows stanzas 1 and 2; the last one's "I'm very sure ... My anchor"
 * wording (id 2) has no place in a refrain stored once, and the script says
 * so when it drops it. Rerunning it on the fixed row changes nothing; any
 * other layout is refused.
 */

import { Database } from 'bun:sqlite';
import path from 'node:path';

const NUMBER = 593;
const BROKEN = [-3, -2, -1, 0, 1, 2];
const FIXED = [-1, 0, 1, 2];

interface Verse {
  readonly id: number;
  readonly text: string;
}

const args = process.argv.slice(2);
const at = args.indexOf('--db');
const file = path.resolve(
  import.meta.dir,
  '../../..',
  at < 0 ? 'packages/core/data/hymnal.db' : (args[at + 1] ?? ''),
);

const db = new Database(file);
const row = db.query('SELECT verses FROM hymns WHERE id = ?').get(NUMBER) as {
  verses: string;
} | null;
if (row === null) throw new Error(`hymn ${NUMBER} is not in ${file}`);
const verses = JSON.parse(row.verses) as Verse[];
const ids = verses.map((verse) => verse.id).join(' ');
const text = (id: number) => {
  const verse = verses.find((v) => v.id === id);
  if (verse === undefined) throw new Error(`hymn ${NUMBER} has no verse ${id}`);
  return verse.text;
};

if (ids === FIXED.join(' ')) {
  console.log(`hymnal-593 already fixed in ${file}`);
} else if (ids === BROKEN.join(' ')) {
  if (text(0) !== text(-2))
    throw new Error(`hymn ${NUMBER}: the refrains after stanzas 1 and 2 differ`);
  const fixed: Verse[] = [
    { id: -1, text: text(-2) },
    { id: 0, text: text(-3) },
    { id: 1, text: text(-1) },
    { id: 2, text: text(1) },
  ];
  db.query('UPDATE hymns SET verses = ? WHERE id = ?').run(JSON.stringify(fixed), NUMBER);
  if (text(2) !== text(-2)) {
    console.log(`hymnal-593 dropped the last refrain's own wording: ${JSON.stringify(text(2))}`);
  }
  console.log(`hymnal-593 fixed in ${file}: ids ${ids} -> ${FIXED.join(' ')}`);
} else {
  throw new Error(
    `hymn ${NUMBER} has verse ids ${ids}, neither the broken layout nor the fixed one`,
  );
}
db.close();
