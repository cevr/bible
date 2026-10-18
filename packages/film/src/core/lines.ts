// The lines of a text: where each starts, and the line (from 1) an offset
// falls on, for the lab's server (the line that writes a cue or a knob,
// `tools/scene-source.ts`). A line ends at its `\n`, which is its own; a
// `\r` before it is the line's text. Pure.

/** Where each line of `text` starts, as offsets (line 1 first). */
export const lineStarts = (text: string): ReadonlyArray<number> => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return starts;
};

/** The line (from 1) `offset` falls on, given where the lines `starts`: the last that starts at or before it. */
export const lineOf = (starts: ReadonlyArray<number>, offset: number): number => {
  // Halving: line `lo` starts at or before `offset`; no line from `hi` on does.
  let lo = 0;
  let hi = starts.length;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if ((starts[mid] ?? Number.POSITIVE_INFINITY) <= offset) lo = mid;
    else hi = mid;
  }
  return lo + 1;
};
