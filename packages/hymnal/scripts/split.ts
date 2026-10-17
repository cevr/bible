/**
 * Prints lines of a hymn with each word cut into its sung syllables, as a
 * hymnal prints them under the notes ("Al-might-y"): one line in, one out.
 * A word that may be sung shorter takes its likeliest count.
 *
 *   bun run split "Praise to the Lord, the Almighty, the King of creation!"
 *   bun run split < lines.txt
 */

import { Syllables } from '../src/index.js';

const cutLine = (line: string) =>
  line
    .split(/(\s+)/)
    .map((token) => Syllables.split(token, Syllables.counts(token)[0] ?? 1).join('-'))
    .join('');

const given = process.argv.slice(2);
const lines = given.length > 0 ? given : (await Bun.stdin.text()).split('\n');
console.log(lines.map(cutLine).join('\n'));
