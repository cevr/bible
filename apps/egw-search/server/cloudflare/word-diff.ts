/**
 * What changed between two versions of a paragraph, word by word.
 *
 * The sync's report shows an edited paragraph as one text with the removed
 * words struck and the added ones marked, rather than as two whole
 * paragraphs a reader has to compare by eye. A paragraph is a few hundred
 * words at most, so the longest common subsequence over its words is cheap.
 */

/** A run of words the two versions share, or that only one of them has. */
export interface DiffSegment {
  readonly kind: 'same' | 'removed' | 'added';
  readonly text: string;
}

const words = (text: string): readonly string[] => text.split(/\s+/).filter((word) => word !== '');

/** The table of common-subsequence lengths of every pair of suffixes. */
const suffixLengths = (before: readonly string[], after: readonly string[]) => {
  const width = after.length + 1;
  const table = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const at = i * width + j;
      if (before[i] === after[j]) table[at] = (table[at + width + 1] ?? 0) + 1;
      else table[at] = Math.max(table[at + width] ?? 0, table[at + 1] ?? 0);
    }
  }
  return { table, width };
};

/** Appends a word to the last segment when it is of the same kind. */
const push = (segments: DiffSegment[], kind: DiffSegment['kind'], word: string) => {
  const last = segments.at(-1);
  if (last?.kind === kind) segments[segments.length - 1] = { kind, text: `${last.text} ${word}` };
  else segments.push({ kind, text: word });
};

/** The two versions as one sequence of shared, removed and added runs. A
 *  removed run comes before the added run that replaced it. */
export const wordDiff = (beforeText: string, afterText: string): readonly DiffSegment[] => {
  const before = words(beforeText);
  const after = words(afterText);
  const { table, width } = suffixLengths(before, after);
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const removedWord = before[i] ?? '';
    const addedWord = after[j] ?? '';
    if (removedWord === addedWord) {
      push(segments, 'same', removedWord);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      push(segments, 'removed', removedWord);
      i += 1;
    } else {
      push(segments, 'added', addedWord);
      j += 1;
    }
  }
  for (const word of before.slice(i)) push(segments, 'removed', word);
  for (const word of after.slice(j)) push(segments, 'added', word);
  return segments;
};
