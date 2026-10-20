/**
 * A hymn's words as the reader shows them: its number, its title, its first
 * line, and its sections in the order the hymnal sings them (each stanza,
 * and the refrain written out each time it is sung). The order is the
 * compiled package's own `sung`; this module only groups its lines.
 *
 * It is derived from the compiled set when the app is bundled
 * (`vite/hymnal.ts`), so the app carries the words alone, never the chords.
 */

import { type Hymn, sung } from '@bible/hymnal/hymn';
import { Option } from 'effect';

export type Section =
  | { readonly kind: 'stanza'; readonly n: number; readonly lines: ReadonlyArray<string> }
  | { readonly kind: 'refrain'; readonly lines: ReadonlyArray<string> };

export interface HymnText {
  readonly number: number;
  readonly title: string;
  /** The first line of stanza 1, as the hymnal indexes it. */
  readonly firstLine: string;
  readonly sections: ReadonlyArray<Section>;
}

const sectionOf = (verse: number | 'refrain', lines: ReadonlyArray<string>): Section => {
  if (verse === 'refrain') return { kind: 'refrain', lines };
  return { kind: 'stanza', n: verse, lines };
};

export const textOf = (hymn: Hymn): HymnText => {
  const runs: Array<{ verse: number | 'refrain'; lines: string[] }> = [];
  for (const line of sung(hymn)) {
    const last = runs.at(-1);
    if (last?.verse === line.verse) last.lines.push(line.text);
    else runs.push({ verse: line.verse, lines: [line.text] });
  }
  const first = runs.find((run) => run.verse === 1)?.lines[0];
  return {
    number: hymn.number,
    title: hymn.title,
    firstLine: Option.getOrElse(Option.fromNullishOr(first), () => ''),
    sections: runs.map(({ verse, lines }) => sectionOf(verse, lines)),
  };
};
