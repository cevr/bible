/**
 * Which line is being sung, and which of its syllables: one store per hymn page,
 * read line by line.
 *
 * Each line subscribes to its own mark, so a syllable moving on tells one line
 * and a line changing tells two (the one left and the one reached); the
 * other lines of the page are never drawn again. A line reads its mark as
 * one number: `OFF` when it is not the sung line, else the index of its sung
 * syllable (`-1` when none is lit: a line-level or Plain line, an unplayed
 * one, or a rest).
 */

/** The mark of a line that is not being sung. */
export const OFF = -2;

export interface Marks {
  /** The line's mark: `OFF`, or its sung syllable (`-1` for none). */
  readonly markOf: (line: number) => number;
  /** Calls `listener` whenever the line's mark changes. */
  readonly subscribe: (line: number, listener: () => void) => () => void;
  /** Marks `line` (`-1` for none) with its sung `syllable` (`-1` for none). */
  readonly set: (line: number, syllable: number) => void;
  /** The sung line, `-1` for none. */
  readonly line: () => number;
}

export const marksOf = (): Marks => {
  let current = { line: -1, syllable: -1 };
  const listeners = new Map<number, Set<() => void>>();
  const tell = (line: number) => listeners.get(line)?.forEach((listener) => listener());
  return {
    markOf: (line) => {
      if (line !== current.line) return OFF;
      return current.syllable;
    },
    subscribe: (line, listener) => {
      const set = listeners.get(line) ?? new Set();
      set.add(listener);
      listeners.set(line, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(line);
      };
    },
    set: (line, syllable) => {
      const was = current;
      if (was.line === line && was.syllable === syllable) return;
      current = { line, syllable };
      tell(was.line);
      if (line !== was.line) tell(line);
    },
    line: () => current.line,
  };
};
